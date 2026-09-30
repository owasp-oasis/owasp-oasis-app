import { Shield, Bug, Lock, Sparkles, Code, Leaf } from 'lucide-react'
import type { TeamLogoKey } from './teamApi'
export default function TeamLogoIcon({logo,size=24,className}:{logo:TeamLogoKey;size?:number;className?:string}) {
  if(logo==='initials')return null
  const Icon={shield:Shield,bug:Bug,lock:Lock,spark:Sparkles,code:Code,leaf:Leaf}[logo]
  return Icon ? <Icon size={size} className={className} strokeWidth={1.8} aria-hidden="true"/> : null
}
