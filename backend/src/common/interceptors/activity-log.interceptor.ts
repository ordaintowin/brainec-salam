import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ActivityLogInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;

    if (!['POST', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    const user = request.user;
    if (!user) return next.handle();

    return next.handle().pipe(
      tap(async (responseData) => {
        try {
          const url: string = request.url;
          const body = request.body;

          let action = method;
          let targetType = 'UNKNOWN';
          const targetId: string | undefined = request.params?.id;
          const description = `${method} ${url}`;

          if (url.includes('/students')) {
            targetType = 'STUDENT';
            if (method === 'POST') action = 'CREATE_STUDENT';
            else if (method === 'PATCH') action = 'UPDATE_STUDENT';
            else if (method === 'DELETE') action = 'ARCHIVE_STUDENT';
          } else if (url.includes('/teachers')) {
            targetType = 'TEACHER';
            if (method === 'POST') action = 'CREATE_TEACHER';
            else if (method === 'PATCH') action = 'UPDATE_TEACHER';
            else if (method === 'DELETE') action = 'ARCHIVE_TEACHER';
          } else if (url.includes('/classes')) {
            targetType = 'CLASS';
            if (method === 'POST') action = 'CREATE_CLASS';
            else if (method === 'PATCH') action = 'UPDATE_CLASS';
            else if (method === 'DELETE') action = 'DELETE_CLASS';
          } else if (url.includes('/users')) {
            targetType = 'USER';
            if (method === 'POST') action = 'CREATE_USER';
            else if (method === 'PATCH') action = 'UPDATE_USER';
          } else if (url.includes('/finance/orders')) {
            targetType = 'FEE_ORDER';
            if (method === 'POST') action = 'CREATE_FEE_ORDER';
          } else if (url.includes('/finance/payments')) {
            targetType = 'PAYMENT';
            if (method === 'POST') action = 'RECORD_PAYMENT';
          } else if (url.includes('/attendance')) {
            targetType = 'ATTENDANCE';
            if (method === 'POST') action = 'MARK_ATTENDANCE';
            else if (method === 'PATCH') action = 'UPDATE_ATTENDANCE';
          } else if (url.includes('/archive')) {
            targetType = url.includes('students') ? 'STUDENT' : 'TEACHER';
            action = 'RESTORE_ARCHIVE';
          } else if (url.includes('/auth/login')) {
            targetType = 'AUTH';
            action = 'LOGIN';
          }

          const sanitizedBody = body ? { ...body } : {};
          if (sanitizedBody.password) sanitizedBody.password = '[REDACTED]';

          await this.prisma.activityLog.create({
            data: {
              userId: user.id,
              action,
              targetType,
              targetId: targetId || responseData?.id || null,
              description,
              metadata: sanitizedBody,
              ipAddress: request.ip,
            },
          });
        } catch (err) {
          console.error('Activity log error:', err);
        }
      }),
    );
  }
}
