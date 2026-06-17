# macOS signing and notarization

macOS DMG assets must be signed with an Apple Developer ID certificate and notarized.
Ad-hoc signing is useful for local smoke tests, but Apple Gatekeeper will still show
"Apple cannot verify" for downloaded releases.

Configure these GitHub repository secrets before running the release workflow:

- `APPLE_CERTIFICATE`: base64-encoded `.p12` Developer ID Application certificate
- `APPLE_CERTIFICATE_PASSWORD`: password for the `.p12` certificate
- `APPLE_ID`: Apple ID email used for notarization
- `APPLE_PASSWORD`: app-specific password for the Apple ID
- `APPLE_TEAM_ID`: Apple Developer Team ID

Optional:

- `APPLE_SIGNING_IDENTITY`: explicit certificate identity if Tauri cannot infer it
- `APPLE_PROVIDER_SHORT_NAME`: provider short name for Apple accounts that need it

Create the certificate secret from an exported `.p12` file:

```bash
base64 -i DeveloperIDApplication.p12 | pbcopy
```

After these secrets are present, Tauri signs the app bundle with the Developer ID
certificate, submits the DMG for notarization, waits for the result, and staples
the ticket to the macOS bundle.
