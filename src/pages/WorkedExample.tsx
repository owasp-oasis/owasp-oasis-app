import GuideDocument from '../components/GuideDocument'
import content from '../../docs/worked-example.md?raw'

export default function WorkedExample() {
  return <GuideDocument active="worked-example" markdown={content} />
}
