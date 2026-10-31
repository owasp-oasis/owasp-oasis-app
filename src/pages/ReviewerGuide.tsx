import GuideDocument from '../components/GuideDocument'
import content from '../../docs/reviewer-guide.md?raw'

export default function ReviewerGuide() {
  return <GuideDocument active="reviewer-guide" markdown={content} />
}
