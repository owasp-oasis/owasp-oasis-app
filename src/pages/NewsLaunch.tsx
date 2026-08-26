import { Link } from 'react-router-dom'
import './NewsLaunch.css'

// TODO Aug 26 at 8:00 AM EST: Replace WIRE_LINK with the live Business Wire URL once Ben confirms it is live
const WIRE_LINK = ''

export default function NewsLaunch() {
  return (
    <div className="news-article">
      <div className="page-hero news-article-hero">
        <div className="container">
          <Link to="/news" className="news-back">&#8592; News &amp; Announcements</Link>
          <span className="badge badge-blue">Press Release</span>
          <h1>OWASP OASIS Launches as Official OWASP Community Project</h1>
          <p className="news-article-meta">August 26, 2026 &middot; OWASP OASIS Founding Team</p>
        </div>
      </div>

      <section className="section">
        <div className="container news-article-body">

          <p className="pr-release">For Immediate Release</p>

          <p className="pr-headline">
            Introducing OWASP OASIS, a New Initiative to Fight Back Against AI and Human Exploits
            of Open Source Software Vulnerabilities
          </p>

          <p className="pr-subhead">
            Global initiative fights AI with AI and application security community expertise,
            validating and implementing AI-generated fixes to remediate open source vulnerabilities
            at scale
          </p>

          <div className="pr-bullets">
            <ul>
              <li><strong>An Effective Model for Open Source Security:</strong> The Open Automated Security Initiative for Software (OASIS) provides human validation that turns AI-generated fix candidates into vetted patches, offering credible, clear fixes for open source maintainers and cutting complexity and noise.</li>
              <li><strong>Complementing Ecosystem Milestones:</strong> Designed to work alongside recent enterprise-led infrastructure initiatives like OpenAI&#8217;s Patch the Planet, the Linux Foundation&#8217;s Akrites, and Anthropic&#8217;s Project Glasswing, OASIS brings a broad, community-scale approach to securing open source code.</li>
              <li><strong>Community Momentum and Scale:</strong> Since opening to sign-ups, OASIS has attracted hundreds of application security champions across industries around the world, alongside founding sponsors AppSecAI, Intigriti, and DryRun Security.</li>
              <li><strong>Built for the AI Threat Era:</strong> As &#8220;vibe hacking&#8221; and AI-driven exploits surge and Mythos dominates the headlines, OASIS offers a vendor-neutral, community-led way for AppSec professionals to collectively tip the balance back toward defenders.</li>
              <li>Fixes are atomic and open-source, creating opportunities for organizations and teams to secure their applications at higher speed.</li>
            </ul>
          </div>

          <p className="pr-dateline">
            <strong>SAN FRANCISCO, CA &#8212; August 26, 2026</strong> &#8212; Today, a growing
            community of application security professionals launched the OWASP Open Automated
            Security Initiative for Software (OASIS). This global initiative marshals human
            expertise to deliver crowd-validated vulnerability fixes for the open source software
            that underlies 98% of commercial codebases (Black Duck 2026 Open Source Security and
            Risk Analysis Report), including critical infrastructure and commercial software. An
            OWASP project, OASIS combines donated AI-powered fix automation and validation tooling
            with human expertise to move open source security from discovery to immediate
            remediation at scale.
          </p>

          <p>
            Since opening preliminary sign-ups, OASIS has attracted hundreds of application security
            professionals from a variety of organizations and industries, alongside founding industry
            members AppSecAI, Intigriti, and DryRun Security.
          </p>

          <blockquote className="pr-quote">
            <p>&#8220;Open source underlies the vast majority of our information economy. Because of the nature of the development process, unremediated vulnerabilities put a huge segment of our critical software infrastructure at risk. OASIS enables the application security and open source communities to cooperatively deliver secure open source software together.&#8221;</p>
            <cite>&#8212; Chris Holt, Strategic Engagement and Community Architect, Intigriti</cite>
          </blockquote>

          <h2>What OWASP OASIS Is</h2>

          <p>
            Open source underlies nearly every layer of modern digital infrastructure. For decades,
            the security industry has focused on finding vulnerabilities. While discovery matters,
            the bottleneck has always been remediation: the cost, process complexity, and specialized
            expertise required to deliver credible security fixes to application vulnerabilities.
            These barriers have historically kept many AppSec professionals on the sidelines.
          </p>

          <p>
            OASIS changes that by leveraging Fix Automation and Validation, an emerging category of
            AI tools that generate and validate candidate vulnerability fixes as vulnerabilities are
            found. OASIS establishes a community-driven fix validation layer that makes those fixes
            trustworthy enough for upstream developer validation and contribution.
          </p>

          <p>With OASIS, fixing vulnerabilities becomes a streamlined, three-part process:</p>

          <ul className="pr-process">
            <li>
              <strong>AI Pipeline</strong>
              Automated tools scan widely used open source repositories and generate candidate
              security fixes at scale. Found vulnerabilities always come with a candidate fix.
            </li>
            <li>
              <strong>Expert Community Validation</strong>
              A community of AppSec professionals and agents reviews the candidate fixes, assesses
              correctness and safety, and determines which ones are credible, reducing complexity
              &#8212; and thus validation &#8212; time to minutes.
            </li>
            <li>
              <strong>Upstream Contribution</strong>
              Validated fixes are provided to open source teams as credible, community-validated
              security patches for consideration, allowing maintainers to quickly validate them for
              functionality and performance and integrate them at their discretion.
            </li>
          </ul>

          <p>
            By generating code fixes while actively contributing to the open source ecosystem, OASIS
            democratizes the vulnerability remediation process. This model shifts the paradigm to a
            community-driven framework for AI-generated, human-vetted code remediation at scale. It
            gives application security experts a collaborative platform to augment human capabilities
            and improve security fixes at open source scale.
          </p>

          <blockquote className="pr-quote">
            <p>&#8220;It&#8217;s always been easier to find than to fix. Even as AI poses an increasing threat, in the right hands, AI-powered tools will shift the balance to the defenders. What OASIS does is finally give those with code security experience the agency to participate. Now, in just a few minutes &#8212; you can contribute. We are excited to help the OWASP OASIS community protect the software that quite literally runs the world.&#8221;</p>
            <cite>&#8212; Michael Cartsonis, Co-Founder and VP of Product, AppSecAI</cite>
          </blockquote>

          <h2>Why Now? Ecosystem Synergy in the AI Era</h2>

          <p>
            The launch of OASIS comes at a defining moment for software security. &#8220;Vibe
            hacking,&#8221; the AI-assisted discovery and exploitation of vulnerabilities, is
            enabling attackers to move faster than any single security team can respond. However,
            the same generative AI powering these attacks offers a defense: the AppSec community
            now has the power to find and generate validated fixes at a comparable speed, tipping
            the balance back toward defenders.
          </p>

          <blockquote className="pr-quote">
            <p>&#8220;AI is dramatically increasing the speed at which software is created, and it&#8217;s also increasing the speed at which vulnerabilities can be discovered and exploited. OASIS is an important step toward giving defenders the same advantage. By combining AI-powered remediation with independent validation and the expertise of the AppSec community, we can turn vulnerability discovery into credible fixes that maintainers can actually use. We&#8217;re proud to support OASIS and help move open source security from finding more problems to fixing them at scale.&#8221;</p>
            <cite>&#8212; James Wickett, CEO and Co-Founder, DryRun Security</cite>
          </blockquote>

          <p>
            This reality has catalyzed complementary initiatives across the industry. Frontier AI
            developments like Anthropic&#8217;s Project Glasswing introduced highly advanced models
            like Claude Mythos to defenders, while OpenAI&#8217;s Patch the Planet and the Linux
            Foundation&#8217;s Akrites have mobilized elite research teams and tech coalitions to
            protect core software infrastructure.
          </p>

          <p>
            For OASIS, these initiatives are complementary pieces of the same puzzle. While other
            programs focus on elite, researcher-led intervention for select high-priority
            infrastructure (like operating systems and browsers), OASIS leverages volunteers from
            the AppSec community to scale broadly across the open source landscape and address the
            long tail of software libraries and applications used by enterprises.
          </p>

          <h2>The OWASP OASIS Approach: Open, Democratic, and Vendor-Agnostic</h2>

          <p>
            To solve a challenge as massive as open source security, the industry requires diverse
            methodologies. OASIS introduces a distinct and simple approach optimized for broad
            community scale, contrasting with and complementing private research initiatives.
          </p>

          <blockquote className="pr-quote">
            <p>&#8220;The legacy corporate incident response model is fundamentally antiquated in the AI era. It relies on a closed loop of people overseeing every step, which fails the second an attacker leverages automated exploit tools. To survive the threat landscape of 2026 and beyond, our defense has to be entirely community-driven and supercharged with automation. OASIS marshals the wisdom of the application security crowd and the power of open source and multi-vendor AI solutions together to challenge threat velocity at a scale that private, vendor-led initiatives just can&#8217;t mirror.&#8221;</p>
            <cite>&#8212; Chris Holt, Strategic Engagement and Community Architect, Intigriti</cite>
          </blockquote>

          <p>
            OASIS operates on a core belief: broad crowd expertise and decentralized participation
            powered by AI will catch and resolve the vast volume of vulnerabilities hiding in
            everyday code backlogs. OASIS uses public technologies and open automation pipelines
            to empower the wider global security workforce.
          </p>

          <h2>Why Open Source Needs OWASP OASIS</h2>

          <p>
            Open source maintainers face an onslaught of low-fidelity information that overwhelms
            even large maintenance teams, leaving serious vulnerabilities unresolved.
          </p>

          <p>
            OASIS acts as a community quality filter. AppSec professionals bring their domain
            expertise to assess whether a candidate fix is accurate and safe. Human validation is
            the vital link that converts rapid AI output into a patch a maintainer can trust. It
            provides a straightforward, vendor-neutral way for AppSec professionals to give back
            to the open source community while cutting through the noise.
          </p>

          <h2>Why Enterprise Users Need OWASP OASIS</h2>

          <p>
            Open source code is present in a vast number of custom enterprise applications. When
            that code is vulnerable, they are exposed, dependent on maintainers to keep their
            organizations running.
          </p>

          <blockquote className="pr-quote">
            <p>&#8220;I have spent thirty years defending enterprises, and every one of them builds on open source components, which means every one of them inherits any unfixed vulnerabilities in that code. Our industry got very good at finding problems and never solved fixing them at scale. That is what OASIS changes. When the community validates a fix and it lands upstream, thousands of applications get safer at once. That is the highest-leverage work an application security professional can do, and now it is open to all of us.&#8221;</p>
            <cite>&#8212; David Kosorok, Director of Product Security, ACV Auctions</cite>
          </blockquote>

          <h2>How to Get Involved</h2>

          <p>
            OWASP OASIS is open to security practitioners, developers, researchers, and anyone
            committed to protecting open source software. Participants can contribute across
            several key roles:
          </p>

          <ul className="pr-roles">
            <li><strong>Vulnerability Validators:</strong> Reviewing and approving candidate AI-generated fixes.</li>
            <li><strong>Repo Community Managers:</strong> Moderating and managing contributors and maintainer activities.</li>
            <li><strong>Maintainer Liaisons:</strong> Managing upstream submissions and maintainer communication.</li>
            <li><strong>Automation Operators:</strong> Running scanning and fix-generation pipelines.</li>
          </ul>

          <div className="news-article-cta">
            {WIRE_LINK
              ? <p>Read the full press release: <a href={WIRE_LINK} target="_blank" rel="noopener noreferrer">Business Wire</a></p>
              : null
            }
            <p>Learn more and join the initiative at <a href="https://owasp-oasis.org">owasp-oasis.org</a>. Registration takes 30 seconds.</p>
          </div>

          <hr className="pr-divider" />

          <p className="pr-boilerplate-title">About OWASP OASIS</p>
          <p className="pr-boilerplate">
            The Open Automated Security Initiative for Software (OASIS) is a vendor-neutral,
            community-driven initiative that mobilizes the Application Security community to
            deliver validated vulnerability fixes for the open source software that runs the
            world. By combining AI-powered fix automation with human expert validation, OASIS
            moves open source security from discovery to remediation at scale. OASIS is an
            OWASP project.
          </p>
          <p className="pr-disclaimer">OWASP does not endorse any product, services, or tools.</p>

          <p className="pr-boilerplate-title">About OWASP</p>
          <p className="pr-boilerplate">
            The OWASP Foundation is a nonprofit organization that works to improve software
            security. Through community-led open source software projects, over 260 local
            chapters worldwide, tens of thousands of members, and leading educational and
            training conferences, the OWASP Foundation is the source for developers and
            technologists to secure the web. For nearly two decades, corporations, foundations,
            developers, and volunteers have supported the OWASP Foundation and its work. To
            learn more or to become a member, visit{' '}
            <a href="https://owasp.org" target="_blank" rel="noopener noreferrer">owasp.org</a>.
          </p>

          <hr className="pr-divider" />

          <div className="pr-contact">
            <p className="pr-contact-label">Media Contact</p>
            <p>
              Kira Rose Wojack<br />
              Merritt &amp; Rose Communications for OWASP OASIS<br />
              +1 415 419-4062<br />
              <a href="mailto:kira@merrittandrose.com">kira@merrittandrose.com</a>
            </p>
          </div>

          <p className="pr-end">###</p>

        </div>
      </section>
    </div>
  )
}
