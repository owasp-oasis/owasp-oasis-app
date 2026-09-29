import { useRef, useState } from 'react'
import { matchingTeamRepositories, type TeamRepository } from './repositoryMatches'

interface Props {
  repositories: TeamRepository[]
  focused: TeamRepository[]
  loading: boolean
  busy: boolean
  onAdd: (repository: TeamRepository) => Promise<boolean>
}

export default function TeamRepositorySearch({ repositories, focused, loading, busy, onAdd }: Props) {
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState<number | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const matches = matchingTeamRepositories(repositories, focused, query)
  const visible = matches.slice(0, 8)

  async function add(repository: TeamRepository) {
    setAdding(repository.id)
    try {
      if (await onAdd(repository)) input.current?.focus()
    } finally { setAdding(null) }
  }

  return <div className="team-repo-form">
    <label>Find a repository<input ref={input} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search repositories by name…" aria-describedby="team-repo-results-summary" /></label>
    <p className="team-help" id="team-repo-results-summary" role="status">
      {loading ? 'Loading repositories…' : matches.length === 0
        ? query.trim() ? 'No available repositories match your search. Try another name.' : repositories.length === 0 ? 'No repositories are available yet.' : 'All available repositories are already in your team’s focus.'
        : matches.length > visible.length ? `Showing ${visible.length} of ${matches.length} repositories. Keep typing to narrow the results.`
          : `${matches.length} ${matches.length === 1 ? 'repository' : 'repositories'} available. Add one to your team’s focus.`}
    </p>
    {!loading && visible.length > 0 && <ul className="team-repo-results" aria-label="Matching repositories">
      {visible.map(repository => <li className="team-row" key={repository.id}>
        <div className="team-row-main"><strong>{repository.name}</strong>{repository.description && <p>{repository.description}</p>}</div>
        <button type="button" className="team-button" disabled={busy || adding !== null} aria-label={'Add ' + repository.name + ' to team focus'} onClick={() => void add(repository)}>{adding === repository.id ? 'Adding…' : '+ Add'}</button>
      </li>)}
    </ul>}
  </div>
}
