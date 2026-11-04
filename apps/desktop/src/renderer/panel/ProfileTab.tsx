import { LOCALE_NAMES } from '@sharescreen/shared'
import type { AppInfo, LanguageSetting, Locale, Profile } from '@sharescreen/shared'
import { Avatar } from '@sharescreen/ui'
import { ImagePlus, Languages, LogOut, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLanguage, useT } from '../shared/i18n'
import { IMAGE_ACCEPT } from '../shared/images'
import { AvatarCropper } from './AvatarCropper'
import { openFilePicker } from '../shared/filePicker'
import { UpdateSection } from './UpdateSection'

const accepted = IMAGE_ACCEPT.split(',')

/**
 * Aba Você: foto (com recorte; aceita GIF animado), nome e idioma do app.
 * É o único lugar onde o nome muda; na chamada, os outros veem a mudança na hora.
 */
export function ProfileTab({ profile, inCall }: { profile: Profile; inCall: boolean }) {
  const t = useT()
  const language = useLanguage()
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [name, setName] = useState(profile.name)
  const [error, setError] = useState<string | null>(null)
  const [cropping, setCropping] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    window.platform.app.getInfo().then(setInfo).catch(console.error)
  }, [])

  const saveName = () => {
    const clean = name.trim()
    if (!clean) {
      setName(profile.name)
      return
    }
    if (clean !== profile.name) window.platform.profile.set({ ...profile, name: clean })
  }

  const pick = (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    if (!accepted.includes(file.type)) {
      setError(t('image.type'))
      return
    }
    setError(null)
    setCropping(file)
  }

  if (cropping) {
    return (
      <AvatarCropper
        file={cropping}
        onCancel={() => setCropping(null)}
        onDone={(avatar) => {
          window.platform.profile.set({ ...profile, avatar })
          setCropping(null)
        }}
      />
    )
  }

  return (
    <div className="stack stack--loose">
      <div className="profile">
        <button
          type="button"
          className="profile__photo"
          title={t('profile.changePhoto')}
          onClick={() => openFilePicker(fileRef.current)}
        >
          <Avatar id="local" name={profile.name || name} src={profile.avatar} size={72} />
          <span className="profile__photo-edit" aria-hidden>
            <ImagePlus size={18} />
          </span>
        </button>
        <div className="profile__actions">
          <button
            type="button"
            className="action action--small"
            onClick={() => openFilePicker(fileRef.current)}
          >
            {profile.avatar ? t('profile.changePhoto') : t('profile.choosePhoto')}
          </button>
          {profile.avatar && (
            <button
              type="button"
              className="action action--small action--quiet"
              onClick={() => window.platform.profile.set({ ...profile, avatar: null })}
            >
              <Trash2 size={14} /> {t('common.remove')}
            </button>
          )}
          <span className="field__hint">{t('profile.photoHint')}</span>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={IMAGE_ACCEPT}
          hidden
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>

      {error && <p className="notice notice--error">{error}</p>}

      <label className="field">
        <span className="field__label">{t('profile.name')}</span>
        <input
          className="field__input"
          value={name}
          maxLength={32}
          placeholder={t('profile.namePlaceholder')}
          autoFocus={!profile.name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
        />
        <span className="field__hint">
          {!profile.name
            ? t('profile.nameRequired')
            : inCall
              ? t('profile.nameLive')
              : t('profile.nameNext')}
        </span>
      </label>

      <label className="field">
        <span className="field__label">
          <Languages size={14} /> {t('profile.language')}
        </span>
        <select
          className="field__input field__select"
          value={language.setting}
          onChange={(e) => window.platform.language.set(e.target.value as LanguageSetting)}
        >
          <option value="system">{t('profile.languageSystem')}</option>
          {(Object.keys(LOCALE_NAMES) as Locale[]).map((locale) => (
            <option key={locale} value={locale}>
              {LOCALE_NAMES[locale]}
            </option>
          ))}
        </select>
      </label>

      <div className="section">
        <UpdateSection />
        {info && (
          <p className="hint hint--flush">
            {t('profile.version', { version: info.version, electron: info.electron })}
          </p>
        )}
        <button
          type="button"
          className="action action--danger"
          onClick={() => window.platform.app.quit()}
        >
          <LogOut size={16} />
          {t('profile.quit')}
        </button>
      </div>
    </div>
  )
}
