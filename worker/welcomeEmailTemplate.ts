export const WELCOME_EMAIL_SUBJECT = 'Welcome to the OASIS community';

/**
 * Adapted from the HubSpot "Welcome email (Sept 3 send)" export.
 * HubSpot tracking parameters, recipient-bound preference links, scripts,
 * tracking pixels, and HubSpot branding are intentionally excluded.
 */
export const WELCOME_EMAIL_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>Welcome to the OASIS community</title>
  </head>
  <body style="margin:0;padding:0;background:#cbd6e2;font-family:Arial,sans-serif;color:#23496d;">
    <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
      Thanks for joining the Open Automated Security Initiative for Software (OASIS), an OWASP project.
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#cbd6e2;">
      <tr>
        <td align="center" style="padding:20px 10px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;">
            <tr>
              <td style="padding:20px;font-size:15px;line-height:1.75;">
                <p style="margin:0;">Hi,</p>
                <p style="margin:24px 0 0;">Thanks for joining the Open Automated Security Initiative for Software (OASIS), an OWASP project. OASIS is for anyone who wants to help secure open source software.&nbsp; Even if you aren't an application security expert, there is plenty to do and learn.</p>
                <p style="margin:24px 0 0;">Here's how OASIS&nbsp;works: AI generates security patches. You review and validate them. It just takes a few minutes. The good ones go to maintainers. As a result open source gets more secure thanks to&nbsp;your expertise.</p>
                <p style="margin:24px 0 0;"><strong>Resources:</strong></p>
                <ol style="margin:0;padding-left:24px;">
                  <li>Visit <a href="https://owasp-oasis.org/" style="color:#00a4bd;">owasp-oasis.org</a> - for more information</li>
                  <li>Connect in the <a href="https://www.linkedin.com/groups/30880006/" style="color:#00a4bd;">LinkedIn OASIS group</a> — join&nbsp;the community</li>
                  <li>Join the new <a href="https://owasp.slack.com/archives/C0BJACRTT0T" style="color:#00a4bd;">#project_oasis</a> channel on OWASP's Slack</li>
                </ol>
                <p style="margin:24px 0 0;">We're excited to have you!&nbsp;</p>
                <p style="margin:24px 0 0;">More soon.&nbsp; Please reach out on the forums if you have questions.</p>
                <p style="margin:24px 0 0;">- The OASIS Team</p>
                <p style="margin:24px 0 0;">P.S. - Tell your friends!&nbsp; They should be here too.</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:10px 20px 20px;">
                <img alt="OASIS" src="https://www.owasp-oasis.org/logo/oasis-wordmark-full.jpg" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;">
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #99acc2;font-size:1px;line-height:1px;">&nbsp;</td>
            </tr>
          </table>
          <p style="margin:30px 20px 0;font-size:12px;line-height:1.35;color:#23496d;">
            OASIS, Open Application Security Initiative for Software, Los Altos, California 94024, US
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

export const WELCOME_EMAIL_TEXT = `Hi,

Thanks for joining the Open Automated Security Initiative for Software (OASIS), an OWASP project. OASIS is for anyone who wants to help secure open source software. Even if you aren't an application security expert, there is plenty to do and learn.

Here's how OASIS works: AI generates security patches. You review and validate them. It just takes a few minutes. The good ones go to maintainers. As a result open source gets more secure thanks to your expertise.

Resources:
1. Visit https://owasp-oasis.org/ - for more information
2. Connect in the LinkedIn OASIS group: https://www.linkedin.com/groups/30880006/
3. Join the new #project_oasis channel on OWASP's Slack: https://owasp.slack.com/archives/C0BJACRTT0T

We're excited to have you!

More soon. Please reach out on the forums if you have questions.

- The OASIS Team

P.S. - Tell your friends! They should be here too.`;
