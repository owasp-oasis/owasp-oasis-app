import RegisterForm from '../components/RegisterForm'
import './Sponsors.css'

type Sponsor = {
  name: string
  type: string
  contribution: string
  siteUrl: string
  logoUrl: string
  logoDark: boolean
  logoWide?: boolean
}

const foundingSponsors: Sponsor[] = [
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

const communitySponsors: Sponsor[] = [
  {
    name: 'Galah Cyber',
    type: 'Community Sponsor',
    contribution: 'The entire Galah Cyber team is dedicating time every week to running OASIS and validating vulnerabilities. They will run office hours, onboarding sessions, and collaborative validation meetups in the Australian time zone and, if we’re lucky, beyond. We are excited to have them as part of the community.',
    siteUrl: 'https://www.galahcyber.com.au?utm_source=project-oasis',
    logoUrl: '/logo/galah-cyber.svg',
    logoDark: false,
    logoWide: true,
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

function SponsorCard({ sponsor }: { sponsor: Sponsor }) {
  return (
    <div className="sponsor-card">
      <a
        href={sponsor.siteUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`sponsor-logo-wrap${sponsor.logoDark ? ' sponsor-logo-wrap--dark' : ''}${sponsor.logoWide ? ' sponsor-logo-wrap--wide' : ''}`}
        aria-label={`Visit ${sponsor.name}`}
      >
        <img
          src={sponsor.logoUrl}
          alt={`${sponsor.name} logo`}
          className="sponsor-logo"
        />
      </a>
      <div className="sponsor-info">
        <div className="sponsor-name-row">
          <h3>
            <a href={sponsor.siteUrl} target="_blank" rel="noopener noreferrer">
              {sponsor.name}
            </a>
          </h3>
          <span className="badge badge-blue">{sponsor.type}</span>
        </div>
        <p>{sponsor.contribution}</p>
      </div>
    </div>
  )
}

export default function Sponsors() {
  return (
    <div className="sponsors">
      <div className="page-hero">
        <div className="container">
          <h1>Sponsors</h1>
          <p>
            OASIS is community-powered and open to corporate participation.
            Sponsorship is strictly resource-based. It does not influence
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
            Vendor neutrality is not just a principle. It is what makes OASIS
            credible to open-source maintainers and the broader community.
          </p>

          <div className="sponsor-cards">
            {foundingSponsors.map(sponsor => <SponsorCard key={sponsor.name} sponsor={sponsor} />)}
          </div>

           {/* Future sponsor slot */}
           <div className="sponsor-slots">
             <a href="#sponsor-interest" className="sponsor-slot-placeholder">
               <span>Your organization here</span>
               <span className="sponsor-slot-cta">Become a sponsor &rarr;</span>
             </a>
           </div>
        </div>
      </section>

      {/* Community sponsors */}
      <section className="section community-sponsors-section">
        <div className="container">
          <h2 className="sponsors-section-title">Community Sponsors</h2>
          <p className="sponsors-section-sub">
            Community sponsors help sustain OASIS with resources that keep its
            open-source security work accessible to everyone.
          </p>

          <div className="sponsor-cards community-sponsor-cards">
            {communitySponsors.map(sponsor => <SponsorCard key={sponsor.name} sponsor={sponsor} />)}
          </div>

          <div className="community-sponsor-callout">
            <div>
              <span className="badge badge-green">Open to the community</span>
              <h3>Help strengthen open-source security</h3>
              <p>
                Community sponsors receive recognition on this page while
                supporting project operations, contributor programs, and shared
                validation infrastructure.
              </p>
            </div>
            <a href="#sponsor-interest" className="btn btn-secondary">
              Become a community sponsor &rarr;
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
               Join our mailing list and the OASIS team will be in touch. All we
               need is your email. You'll receive occasional updates about partnership opportunities.
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
              successMessage="Thanks. We'll be in touch about how your organization can support OASIS."
            />
          </div>
        </div>
      </section>
    </div>
  )
}
