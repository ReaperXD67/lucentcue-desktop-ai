# Code signing policy

**Status: application submitted; approval pending; not signed.** On 18 October 2026, the owner reported successful submission of the SignPath application. No approval, active signing configuration, or certificate has been confirmed. The public 0.2.1 and earlier 0.2.0 previews contain unsigned packages. Windows Application Control refused the checksum-verified 0.2.0 installer on the tested PC; the existing 0.1.1 installation remains. A valid signature must also satisfy that device's policy. Signing alone cannot promise installation on every managed PC.

## Free Windows route

[SignPath Foundation](https://signpath.org/) is the free Windows signing route currently being pursued: it can provide publicly trusted signing for accepted open-source projects. A free SignPath platform subscription alone does not establish that the Foundation has approved a certificate for LucentCue.

Its [published conditions](https://signpath.org/terms.html) require maintained, released, documented open-source software, verifiable builds, appropriate metadata, MFA, named maintainers, and manual release approval. Executable applications also need verifiable reputation. Acceptance is discretionary; this young project has no promised eligibility or approval date. Signing must cover our own code rather than replacing upstream publishers' identities. The policy also excludes security circumvention tools. These requirements are an onboarding checklist, not a claim that an application has been accepted.

The owner reports having submitted the [official application](https://signpath.org/apply.html) using their own contact details. Any email verification, remaining account setup, MFA, identity checks, and release approvals belong to the owner. The assistant filled public project details and did not submit or accept agreements on the owner's behalf. No provider attribution or certificate identity is claimed here.

### Fill the official application

These labels follow the [application form](https://signpath.org/apply.html). The assistant prefilled public project fields, and the owner subsequently reported successful submission. The values below preserve the project draft for reference; they are not an independently verified receipt or a reason to submit a duplicate application. Do not put an email address or signing token in this repository or in chat.

| Form field                   | Value or owner action                                                                                                                                                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project name                 | `LucentCue`                                                                                                                                                                                                                   |
| Repository URL               | `https://github.com/ReaperXD67/lucentcue-desktop-ai`                                                                                                                                                                          |
| Homepage URL                 | `https://github.com/ReaperXD67/lucentcue-desktop-ai`                                                                                                                                                                          |
| Download URL                 | `https://github.com/ReaperXD67/lucentcue-desktop-ai/releases/tag/v0.2.1-preview.1` — this page offers unsigned previews; do not claim SignPath provides signing before approval                                               |
| Privacy policy URL           | `https://github.com/ReaperXD67/lucentcue-desktop-ai#data-and-privacy` — existing data-handling documentation; review it and the third-party policies before submission, and supply a separate policy if SignPath requests one |
| Wikipedia URL                | Leave blank; no project article is verified                                                                                                                                                                                   |
| Tagline                      | `Open-source desktop AI companion with screenshot and browser assistance`                                                                                                                                                     |
| Category                     | `AI Tools`                                                                                                                                                                                                                    |
| Description                  | Use the short paragraph below                                                                                                                                                                                                 |
| Reputation                   | Use the evidence paragraph below; do not invent download counts, endorsements, or an established user base                                                                                                                    |
| Maintainer type              | `Individual maintainer(s)` — owner must confirm this describes the project                                                                                                                                                    |
| Build system                 | `GitHub Actions` — GitHub-hosted runners; public [native build workflow](../.github/workflows/build.yml)                                                                                                                      |
| First name, last name, email | Owner enters their actual contact details privately                                                                                                                                                                           |
| Company name                 | Leave blank unless you are applying for a real company                                                                                                                                                                        |
| Primary discovery channel    | `AI / LLM tools`                                                                                                                                                                                                              |
| Exact source                 | `ChatGPT/Codex assistance, verified against https://signpath.org/ and Microsoft's code-signing documentation.`                                                                                                                |

**Description:**

> LucentCue is an open-source desktop AI companion for Windows, macOS, and Linux. Users can bring their own provider keys, choose free OpenRouter models, review screenshot attachments before sending, and request assistance in a visible browser. A compact companion and full workspace provide configurable shortcuts, themes, and settings. Optional recording protection uses operating-system APIs with documented limits; the application does not conceal its process or evade system monitoring.

**Reputation:**

> LucentCue is a newly released MIT project. Public source and commit history are available at https://github.com/ReaperXD67/lucentcue-desktop-ai, preview downloads at https://github.com/ReaperXD67/lucentcue-desktop-ai/releases, and automated build/test results at https://github.com/ReaperXD67/lucentcue-desktop-ai/actions. The project does not yet claim an established community or verified adoption figures. We request an eligibility review and guidance on signing our Windows application, NSIS uninstaller, and final installer while preserving upstream publishers' signatures.

The form deliberately asks for a short description without dependency or version lists. The repository is the evidence for implementation details, MIT licensing, and the current release.

### Owner-only submission checklist

Submission is complete according to the owner's report. Keep the confirmation privately and check the supplied inbox, including spam, for any verification or follow-up. Do not submit a duplicate unless SignPath asks for one. The checklist below records the process; approval and the post-submission setup are still pending.

1. Review the project fields and supply your real first name, last name, and contact email. Confirm the maintainer type and actual discovery channel.
2. Read the [Foundation conditions and code of conduct](https://signpath.org/terms.html). Complete the required code-of-conduct agreement and personal-data processing consent only if you accept them. The marketing checkbox is optional; leave it unchecked unless you want those messages.
3. Select **Submit** and complete any requested reCAPTCHA yourself. Look for the page's confirmation and any verification email. A prepared form alone is not a submitted application.
4. Follow SignPath's response. If accepted, create or finish the requested account setup, enable MFA on SignPath and GitHub, and confirm the maintainer/reviewer/release-approver roles. Do not claim these checks are complete until they are.
5. Provide the approved organization/project identifiers, signing policy, artifact configuration, and exact certificate subject for integration. Add the signing API token directly to the designated protected **GitHub Actions environment secret** when the pipeline is configured; do not send it through chat.

Before submitting, review the current [data boundaries](../README.md#data-and-privacy), [browser behavior](BROWSER.md), and third-party policies in [Getting started](GETTING_STARTED.md#privacy-settings-and-limits). Provider requests carry submitted prompts and approved attachments; catalog discovery and explicit browser setup also make network requests. A privacy statement must describe those behaviors accurately. A young executable project may need further reputation evidence or may be declined; there is no promised approval date.

## Integration after acceptance

There is deliberately no active signing workflow or dummy secret configuration. The existing native build workflow still produces **unsigned** artifacts. These are the remaining implementation steps once the provider approves an actual project and artifact configuration:

1. Confirm the exact signing organization, project slug, signing policy, artifact configuration, approved certificate subject, and signer roles with SignPath. Publish the accepted policy and required attribution only when applicable.
2. Link GitHub as the trusted build system for this repository. The [official GitHub integration](https://docs.signpath.io/trusted-build-systems/github) verifies artifact origin and requires hosted runners for Foundation projects. It signs an artifact uploaded by that same workflow using the official `signpath/github-action-submit-signing-request` action. Give the submitter only the required project permission; keep its token in a protected GitHub environment secret. Restrict the workflow to owner-triggered releases from reviewed source, with read-only repository/Actions permissions and manual approval by the designated release approver.
3. Agree the **complete payload** strategy before implementation. [SignPath's format reference](https://docs.signpath.io/artifact-configuration/reference) describes PE signing and deep signing for several package formats; it does not document NSIS as a deep-signable container. Signing only the outer EXE cannot establish that the installed app, generated uninstaller, and helpers are signed. A staged Electron build or a provider-approved packaging approach is needed. The current `win.signExecutable: false` must be replaced by a verified signing integration for that path; flipping it alone does not create a signature.
4. Preserve valid upstream Electron/helper signatures. Do not apply the Foundation certificate indiscriminately to third-party files. Inventory unsigned payloads with the verification script below and agree coverage with the provider and deployment administrator.
5. Wait for manual release approval, verify returned signatures and metadata, generate checksums **after** signing, and attach the outputs to a distinct draft release. Keep existing unsigned release assets and checksums immutable. Publish only after source CI, signing, and package verification succeed. Test installation and shortcuts on the actual device separately.

Unknown credentials, pending approval, and the untested NSIS integration prevent a signed installer today. They are external/setup dependencies; rebuilding the same unsigned installer is not a signing solution.

### Install and open after a signed release is verified

Download the newly signed Windows installer and its matching checksum file from the project's release page. Verify signatures with the script below, then use **Quit LucentCue** in the existing app or tray menu and run the verified installer into the same installation location. If Application Control still refuses it, stop and obtain an administrator-approved deployment; do not change Windows security settings to work around the refusal.

Open **Start → LucentCue** or the desktop shortcut. A successfully installed 0.2.x upgrade starts in the small companion; **Alt+W** shows/hides it, **Alt+Shift+S** captures a display for review in the composer, and the companion's **Settings** button opens the full workspace. The currently installed 0.1.1 still uses **Alt+R** until upgraded. Screenshots are attached for review; they are sent only when you submit a message, and capture is not guaranteed to be undetectable. See [Getting started](GETTING_STARTED.md) for provider keys, themes, and the recording-protection limits.

To remove the installed app, use **Windows Settings → Apps → Installed apps → LucentCue → Uninstall**. Local app data may remain; export any conversations you need before uninstalling or changing versions.

## Read-only Windows verification

[`scripts/verify-windows-signatures.ps1`](../scripts/verify-windows-signatures.ps1) checks the installer, `LucentCue.exe`, NSIS uninstaller, and every `.exe`, `.dll`, and `.node` payload in the supplied application directory. It requires Windows-valid signatures, code-signing certificates, timestamps, consistent project product versions, and the exact approved subject on the three project executables. Upstream payload publishers may differ. Any missing, invalid, unsigned, or inaccessible file fails the check. It does not execute packages, install certificates, change trust, or modify Application Control.

Run from the repository in Windows PowerShell 5.1 or newer. Replace paths and the subject with actual signing-onboarding values; do not use a guessed publisher:

```powershell
$verification = @{
    InstallerPath = 'C:\release\LucentCue.Setup.0.2.1.exe'
    AppDirectory = 'C:\release\extracted-app'
    ExpectedPublisher = '<exact approved certificate Subject>'
    # Optional when the generated uninstaller is stored outside AppDirectory:
    # UninstallerPath = 'C:\release\Uninstall LucentCue.exe'
    # Optional fresh report file; its parent must already exist:
    # ReportPath = 'C:\release\signature-report.json'
}
.\scripts\verify-windows-signatures.ps1 @verification
```

Exit code 0 means the listed checks passed; exit code 1 means verification failed. Missing inputs or read errors also stop execution. The JSON report includes local paths and should stay in an ignored local directory. This script checks Windows' signature result, not the administrator's separate Application Control allow rules, and does not independently validate the package's source provenance. An approved hosted build and installation/runtime checks remain necessary.

## Other distribution options

[Microsoft's comparison](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options) also documents free **Store MSIX** signing after certification. That requires a separate MSIX/Store delivery path, account onboarding, and feature compatibility testing; uploading the current NSIS EXE does not obtain that free signature. Azure Artifact Signing is paid and has regional identity restrictions. Self-signed certificates are not publicly trusted and do not solve this device's Application Control block.

Windows signing does not sign or notarize the Mac packages. [Electron's macOS guidance](https://www.electronjs.org/docs/latest/tutorial/code-signing) requires Apple Developer Program credentials for normal Developer ID signing and notarization. Mac/Linux packages remain separately built and their runtime behavior remains unverified.
