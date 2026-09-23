import { useRef, useState } from 'react'

interface Props {
  kind: 'logo' | 'banner'
  value?: string | null
  disabled?: boolean
  busy?: boolean
  onUpload: (file: File) => Promise<void>
  onRemove: () => Promise<void>
}

const copy = {
  logo: { label: 'Custom logo', help: 'Square PNG, JPEG, or WebP · up to 256 KB', accept: 'image/png,image/jpeg,image/webp' },
  banner: { label: 'Team homepage banner', help: 'Wide PNG, JPEG, or WebP · up to 768 KB', accept: 'image/png,image/jpeg,image/webp' },
} as const

export default function TeamMediaUpload({ kind, value, disabled = false, busy = false, onUpload, onRemove }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const details = copy[kind]
  const image = preview ?? value
  async function choose(file: File | undefined) {
    if (!file) return
    setError(null)
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setError('Choose a PNG, JPEG, or WebP image.'); return }
    const max = kind === 'logo' ? 256 * 1024 : 768 * 1024
    if (file.size > max) { setError(`Keep the ${kind} under ${kind === 'logo' ? '256 KB' : '768 KB'}.`); return }
    setPreview(URL.createObjectURL(file))
    try { await onUpload(file) } catch (caught) { setPreview(null); setError(caught instanceof Error ? caught.message : 'Could not upload this image.') }
  }
  async function remove() {
    setError(null)
    try { await onRemove(); setPreview(null) } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not remove this image.') }
  }
  return <div className={'team-media-upload team-media-upload--' + kind}>
    <div className="team-media-preview" aria-hidden="true">
      {image ? <img src={image} alt="" /> : <span>{kind === 'logo' ? 'Logo' : 'Banner'}</span>}
    </div>
    <div className="team-media-copy"><strong>{details.label}</strong><span>{details.help}</span>{error && <span className="team-error" role="alert">{error}</span>}<div className="team-actions"><button type="button" className="team-button" disabled={disabled || busy} onClick={() => input.current?.click()}>{image ? 'Replace' : 'Upload'}</button>{image && <button type="button" className="team-link team-media-remove" disabled={disabled || busy} onClick={() => void remove()}>Remove</button>}</div></div>
    <input ref={input} className="team-sr-only" type="file" accept={details.accept} disabled={disabled || busy} onChange={event => { void choose(event.target.files?.[0]); event.target.value = '' }} />
  </div>
}
