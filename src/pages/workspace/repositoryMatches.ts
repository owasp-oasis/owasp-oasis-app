export interface TeamRepository { id: number; name: string; description?: string }

export function matchingTeamRepositories(repositories: TeamRepository[], focused: TeamRepository[], query: string) {
  const excluded = new Set(focused.map(repository => repository.id))
  const search = query.trim().toLowerCase()
  return repositories.filter(repository => !excluded.has(repository.id) && repository.name.toLowerCase().includes(search))
    .sort((a, b) => a.name.localeCompare(b.name))
}
