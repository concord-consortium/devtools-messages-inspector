# Protecting Against Malicious Clones

Since this is an open source extension, anyone could clone the code, add spyware, and publish it under a similar name. The Chrome Web Store has no mechanism to verify that a listing is the "official" version of an open source project.

## Available Protections

- **Chrome Web Store review** - Google's automated and manual review catches some malware, but spyware regularly slips through.
- **Permissions warnings** - If a clone requests more permissions than ours, users see a scarier install prompt. However, this extension already uses `<all_urls>`, so a clone wouldn't need to escalate permissions.
- **User reviews and install count** - Established extensions with more installs and reviews tend to earn more trust.
- **Reporting** - Impersonating extensions can be reported to Google for takedown, though this isn't instant.
- **Link GitHub repo to store listing** - Users can verify the source code matches what's published.
- **Put store listing URL in the README** - People coming from GitHub go to the right place instead of finding a clone in search.
