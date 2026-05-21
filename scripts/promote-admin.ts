import { User } from '../app/models/.server/user'

let email = process.argv[2]

if (!email) fail('Usage: pnpm tsx scripts/promote-admin.ts <email>')

let user = await User.findByEmail(email)

if (!user) fail(`Error: user not found for email ${email}`)

await User.update(user.id, { role: 'admin' })

console.log(`Promoted ${user.email} to admin`)

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}
