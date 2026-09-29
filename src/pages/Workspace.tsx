import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { Decision } from '../components/VoteForm'
import ProjectsTab from './workspace/ProjectsTab'
import PRsTab from './workspace/PRsTab'
import ContributorsTab from './workspace/ContributorsTab'
import MaintainersTab from './workspace/MaintainersTab'
import ToolsTab from './workspace/ToolsTab'
import TeamsTab from './workspace/TeamsTab'
import MyQueue from './workspace/MyQueue'
import Preferences from './workspace/Preferences'
import WorkspaceLayout from './workspace/WorkspaceLayout'
import { useWorkspaceData } from './workspace/useWorkspaceData'
export type WorkspaceTab = 'queue' | 'projects' | 'prs' | 'contributors' | 'tools' | 'maintainers' | 'teams' | 'preferences'
const titles: Record<WorkspaceTab, string> = { queue: 'My queue', projects: 'Projects', prs: 'Candidate fixes', contributors: 'Validators', tools: 'Fix automation', maintainers: 'Maintainers', teams: 'Teams', preferences: 'Preferences' }
const endpoints: Record<WorkspaceTab, string | null> = { queue: '/api/workspace/prs', prs: '/api/workspace/prs', projects: '/api/workspace/repos', contributors: '/api/workspace/contributors', tools: '/api/workspace/tools', maintainers: '/api/workspace/maintainers', teams: '/api/teams', preferences: null }
export default function Workspace({ activeTab }: { activeTab: WorkspaceTab }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data, loading, error, retry } = useWorkspaceData<any>(endpoints[activeTab], activeTab === 'teams' ? { teams: [] } : [])
  const votes = useWorkspaceData<{ votes?: { pr_id: number; decision: Decision }[] }>(user ? '/api/votes/mine' : null, {})
  const voteMap = new Map((votes.data.votes ?? []).map(v => [v.pr_id, v.decision]))
  return <WorkspaceLayout title={titles[activeTab]} queue={activeTab === 'queue'}>
    {error ? <div className="ws-error" role="alert"><h2>Could not load {titles[activeTab].toLowerCase()}</h2><p>{error}</p><button className="ws-button" onClick={retry}>Retry</button></div> : <>
      {activeTab === 'queue' && <MyQueue data={data} loading={loading || votes.loading} votes={voteMap} voteError={votes.error} retryVotes={votes.retry} />}
      {activeTab === 'prs' && <PRsTab data={data} loading={loading} />}
      {activeTab === 'projects' && <ProjectsTab data={data} loading={loading} myVotes={voteMap} onNavigateToPRs={id => navigate('/workspace/fixes?repo=' + id)} />}
      {activeTab === 'contributors' && <ContributorsTab data={data} loading={loading} />}
      {activeTab === 'maintainers' && <MaintainersTab data={data} loading={loading} />}
      {activeTab === 'tools' && <ToolsTab data={data} loading={loading} />}
      {activeTab === 'teams' && <TeamsTab data={data.teams ?? []} loading={loading} onCreated={retry} />}
      {activeTab === 'preferences' && <Preferences />}
    </>}
  </WorkspaceLayout>
}
