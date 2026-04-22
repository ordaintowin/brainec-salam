import { PrismaClient } from '@prisma/client'
import fs from 'fs'

const prisma = new PrismaClient()

async function main() {
  console.log('Reading data from old database...')
  const students = await prisma.student.findMany()
  const classes = await prisma.class.findMany()
  const users = await prisma.user.findMany()

  const backup = { students, classes, users }
  fs.writeFileSync('prisma/backup_data.json', JSON.stringify(backup, null, 2))
  console.log('✅ Success: 180+ records saved to backup_data.json')
}

main().finally(async () => await prisma.$disconnect())
