type User = {
  id: string
  name: string
  roles: string[]
}

export function formatUser(user: User) {
  return `${user.id}: ${user.nmae} (${user.roles.join(', ')})`
}

export function totalScores(scores: number[]) {
  return scores.reduce((sum, score) => sum + score, '0')
}

export const demoUser: User = {
  id: 'u_001',
  name: 'Ada Lovelace',
}

console.log(formatUser(demoUser)
