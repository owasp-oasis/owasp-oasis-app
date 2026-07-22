import RegisterForm from '../components/RegisterForm'
import './Sponsors.css'

const foundingSponsors = [
  {
    name: 'AppSecAI',
    type: 'Founding Sponsor',
    contribution: 'Tool licenses and operational resources for fix automation candidate generation.',
    siteUrl: 'https://www.appsecai.io?utm_source=project-oasis',
    logoUrl: 'https://www.appsecai.io/hubfs/Logo.%20Blue.%20Horizontal.svg',
    logoDark: false,
  },
  {
    name: 'Intigriti',
    type: 'Founding Sponsor',
    contribution: 'Community building, technical expertise, and development resources supporting the OASIS framework, validator community, and program operations.',
    siteUrl: 'https://www.intigriti.com?utm_source=project-oasis',
    logoUrl: 'https://www.datocms-assets.com/85623/1713941207-intigriti-logo.svg',
    logoDark: false,
  },
  {
    name: 'DryRun Security',
    type: 'Founding Sponsor',
    contribution: 'Tool licenses and operational resources supporting the OASIS validation workflow.',
    siteUrl: 'https://www.dryrun.security?utm_source=project-oasis',
    logoUrl: 'https://cdn.prod.website-files.com/645932d9286e9c20dd8e0fca/688b80486034525524cedf86_DRS-Logo-icon-green-white-dark%20background.svg',
    logoDark: true,
  },
]

const tiers = [
  {
    name: 'Community Sponsor',
    desc: 'Support the OASIS mission with resources that help the community operate at scale.',
  },
  {
    name: 'Tool Participant',
    desc: 'Contribute fix automation tool output to the OASIS pipeline and receive real-world validation performance data.',
  },
  {
    name: 'Founding Sponsor',
    desc: 'Named as a founding partner of OASIS. Provides tool licenses and operational resources from day one.',
  },
]

export default function Sponsors() {
  return (
    <div className="sponsors">
      <div className="page-hero">
        <div className="container">
          <h1>Sponsors</h1>
          <p>
            OASIS is community-powered and open to corporate participation.
            Sponsorship is strictly resource-based &mdash; it does not influence
            project governance, fix selection, or validation outcomes.
          </p>
        </div>
      </div>

      {/* Participation models */}
      <section className="section-sm sponsors-tiers">
        <div className="container">
          <h2 className="sponsors-section-title">Participation Models</h2>
          <p className="sponsors-section-sub">
            OASIS is a vendor-neutral, community-driven project. Corporate
            participation is welcome and structured to preserve that neutrality.
          </p>
          <div className="tiers-grid">
            {tiers.map(t => (
              <div key={t.name} className="tier-card">
                <h3>{t.name}</h3>
                <p>{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Founding sponsors */}
      <section className="section">
        <div className="container">
          <h2 className="sponsors-section-title">Founding Sponsors</h2>
          <p className="sponsors-section-sub">
            These organizations believed in OASIS from the start and provide the
            tool licenses and operational resources that make the project possible.
            Vendor neutrality is not just a principle &mdash; it&rsquo;s what makes OASIS
            credible to open-source maintainers and the broader community.
          </p>

          <div className="sponsor-cards">
            {foundingSponsors.map(s => (
              <div key={s.name} className="sponsor-card">
                <a
                  href={s.siteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`sponsor-logo-wrap${s.logoDark ? ' sponsor-logo-wrap--dark' : ''}`}
                  aria-label={`Visit ${s.name}`}
                >
                  <img
                    src={s.logoUrl}
                    alt={`${s.name} logo`}
                    className="sponsor-logo"
                  />
                </a>
                <div className="sponsor-info">
                  <div className="sponsor-name-row">
                    <h3>
                      <a href={s.siteUrl} target="_blank" rel="noopener noreferrer">
                        {s.name}
                      </a>
                    </h3>
                    <span className="badge badge-blue">{s.type}</span>
                  </div>
                  <p>{s.contribution}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Future sponsor slot */}
          <div className="sponsor-slots">
            <a href="#sponsor-interest" className="sponsor-slot-placeholder">
              <span>Your organization here</span>
              <span className="sponsor-slot-cta">Register interest &rarr;</span>
            </a>
          </div>
        </div>
      </section>

      {/* Interest form */}
      <section className="section sponsors-form-section" id="sponsor-interest">
        <div className="container sponsors-form-inner">
          <div className="sponsors-form-copy">
            <h2>Interested in supporting OASIS?</h2>
            <p>
              Register your interest and the OASIS team will be in touch. All we
              need is your email &mdash; no commitment required.
            </p>
            <p>
              Corporate sponsorship does not influence OASIS governance, fix
              selection, validation outcomes, or community direction. The project
              is structured to remain genuinely vendor-neutral under OWASP.
            </p>
          </div>
          <div className="sponsors-form-wrap">
            <RegisterForm
              type="sponsor"
              successMessage="Thanks — we'll be in touch about how your organization can support OASIS."
            />
          </div>
        </div>
      </section>
    </div>
  )
}
