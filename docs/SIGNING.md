# Code signing policy

**Status: not enrolled, not signed.** The public 0.2.1 and earlier 0.2.0 previews contain unsigned packages. Windows Application Control refused the checksum-verified 0.2.0 installer on the tested PC; the existing 0.1.1 installation remains. A valid signature must also satisfy that device's policy. Signing alone cannot promise installation on every managed PC.

## Free Windows route

[SignPath Foundation](https://signpath.org/) is the first route to apply for: it can provide publicly trusted signing for accepted open-source projects. A free SignPath platform subscription alone does not establish that the Foundation has approved a certificate for LucentCue.

Its [published conditions](https://signpath.org/terms.html) require maintained, released, documented open-source software, verifiable builds, appropriate metadata, MFA, named maintainers, and manual release approval. Executable applications also need verifiable reputation. Acceptance is discretionary; this young project has no promised eligibility or approval date. Signing must cover our own code rather than replacing upstream publishers' identities. The policy also excludes security circumvention tools. These requirements are an onboarding checklist, not a claim that an application has been accepted.

The owner must review and submit the [official application](https://signpath.org/apply.html) using their own contact details. Account creation, MFA, terms acceptance, any identity checks, and release approvals belong to the owner. No application or message has been submitted on their behalf, and no provider attribution or certificate identity is claimed here.

### Application draft for the owner

Review these facts and use them in the corresponding form fields. Add your own name and contact email privately; do not commit them or a signing token.

| Field                    | Draft                                                                                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project                  | LucentCue                                                                                                                                                                         |
| Homepage / repository    | https://github.com/ReaperXD67/lucentcue-desktop-ai                                                                                                                                |
| License                  | MIT; repository source and build scripts are public                                                                                                                               |
| Maintainer               | Repository owner [ReaperXD67](https://github.com/ReaperXD67)                                                                                                                      |
| Released Windows package | [0.2.1 preview](https://github.com/ReaperXD67/lucentcue-desktop-ai/releases/tag/v0.2.1-preview.1)                                                                                 |
| Build system             | GitHub Actions on GitHub-hosted Windows, macOS, and Linux runners                                                                                                                 |
| Native build workflow    | [.github/workflows/build.yml](../.github/workflows/build.yml)                                                                                                                     |
| Signing needed           | Windows x64 Electron application, NSIS installer and uninstaller; payload coverage needs review                                                                                   |
| Reputation / usage       | Newly released project. No established download volume or user-base claim; public releases, source history, and Actions runs are available for review.                            |
| Proposed signing roles   | Owner as author, reviewer of outside contributions, and release approver, subject to owner confirmation and Foundation acceptance. MFA status is not verified by this repository. |

Suggested description:

> LucentCue is an MIT desktop AI companion for Windows, macOS, and Linux. It supports personal provider keys, verified zero-priced OpenRouter models, reviewed screenshot attachments, and explicit assistance in a visible Chromium browser. Its compact companion opens with Alt+W. The project uses original TypeScript, Electron, React, and Playwright. Optional recording protection uses supported operating-system APIs with documented limits; the app does not conceal its process or evade system monitoring. We seek trusted signing for publicly reproducible Windows releases and need guidance on signing the Electron application, NSIS uninstaller, and final installer while preserving upstream signatures. The project is new, and we do not claim an established community or prior signing approval.

Privacy information to supply with the application:

> Provider requests are sent when the user submits a question. Screenshot and page-text attachments are reviewed before sending. Free-model discovery requests OpenRouter's public catalog. Chromium is downloaded only after explicit setup; pages and website resources load in its separate visible profile. Keys stay in the main process and use OS-backed encryption where available. Optional local text history is off by default; screenshots are not persisted in history. There is no app telemetry or automatic update service. External links open only after a user action. Provider and website privacy policies apply to material sent to them.

Review the current [data boundaries](../README.md#data-and-privacy), [browser behavior](BROWSER.md), and the policies linked in [Getting started](GETTING_STARTED.md#privacy-settings-and-limits) before submission. Direct OpenAI and Gemini requests also use their respective [API data policy](https://developers.openai.com/api/docs/guides/your-data) and [Gemini API terms](https://ai.google.dev/gemini-api/terms). A formal onboarding privacy policy should accurately cover network requests and third-party services; do not substitute a claim that the app never uses the network.

## Integration after acceptance

There is deliberately no active signing workflow or dummy secret configuration. The existing native build workflow still produces **unsigned** artifacts. These are the remaining implementation steps once the provider approves an actual project and artifact configuration:

1. Confirm the exact signing organization, project slug, signing policy, artifact configuration, approved certificate subject, and signer roles with SignPath. Publish the accepted policy and required attribution only when applicable.
2. Link GitHub as the trusted build system for this repository. The [official GitHub integration](https://docs.signpath.io/trusted-build-systems/github) verifies artifact origin and requires hosted runners for Foundation projects. It signs an artifact uploaded by that same workflow using the official `signpath/github-action-submit-signing-request` action. Give the submitter only the required project permission; keep its token in a protected GitHub environment secret. Restrict the workflow to owner-triggered releases from reviewed source, with read-only repository/Actions permissions and an independent approval step.
3. Agree the **complete payload** strategy before implementation. [SignPath's format reference](https://docs.signpath.io/artifact-configuration/reference) describes PE signing and deep signing for several package formats; it does not document NSIS as a deep-signable container. Signing only the outer EXE cannot establish that the installed app, generated uninstaller, and helpers are signed. A staged Electron build or a provider-approved packaging approach is needed. The current `win.signExecutable: false` must be replaced by a verified signing integration for that path; flipping it alone does not create a signature.
4. Preserve valid upstream Electron/helper signatures. Do not apply the Foundation certificate indiscriminately to third-party files. Inventory unsigned payloads with the verification script below and agree coverage with the provider and deployment administrator.
5. Wait for manual release approval, verify returned signatures and metadata, generate checksums **after** signing, and attach the outputs to a distinct draft release. Keep existing unsigned release assets and checksums immutable. Publish only after source CI, signing, and package verification succeed. Test installation and shortcuts on the actual device separately.

Unknown credentials, pending approval, and the untested NSIS integration prevent a signed installer today. They are external/setup dependencies; rebuilding the same unsigned installer is not a signing solution.

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
