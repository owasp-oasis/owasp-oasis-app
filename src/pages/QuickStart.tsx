import GuideDocument from '../components/GuideDocument'
import content from '../../docs/quick-start.md?raw'

export default function QuickStart() {
  return <GuideDocument active="quick-start" markdown={content} />
}
