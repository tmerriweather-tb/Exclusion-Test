# Free Venue Exclusion Directory URL + Artwork OCR

**No OpenAI API key and no paid AI API required.** This version keeps your directory and existing keyword/synonym-based Copilot. It retrieves readable public website text through a Netlify Function and uses Tesseract.js in the visitor's browser to read visible text in artwork images. Tesseract.js is downloaded from the public jsDelivr CDN at runtime; internet access is required. OCR cannot interpret logos, objects, or purely visual themes. All artwork needs human visual review.

## Deploy

1. Extract ZIP, preserving `netlify/functions/analyze-urls.mjs`.
2. Upload extracted files to a GitHub repository, with `index.html` and `netlify.toml` at the repository root.
3. In Netlify, create a new project from the GitHub repository. Publish directory: `.`. Functions directory: `netlify/functions`. Build command: blank.
4. Deploy. **No environment variables, API keys, or billing account needed for the scanner.** Netlify hosting and function free-tier quotas still apply.
5. Test with a public webpage URL and a direct public PNG/JPEG/WebP/GIF image URL. Alternatively, use the artwork upload input to scan a local image without retrieving its URL.

## Limitations and safety

- Public, server-rendered HTML and visible text only; no JavaScript execution, deep crawling, or login pages. Some sites block requests.
- OCR reads printed English text only; handwriting, small print, and stylized artwork may be missed. Image-only advertising subjects cannot be assessed.
- Website text is truncated to a safe length; extraction is not exhaustive. No match does not mean approved.
- The Netlify function blocks known private/reserved addresses and validates redirects, but public untrusted URL fetching still warrants production security review and request throttling.
- For shared filter views, deploy the server function alongside the HTML. A standalone local HTML file can use the optional local artwork upload for OCR (subject to CDN access), but website URL retrieval needs the Netlify Function.

## Website theme summary upgrade

The Compliance Copilot now displays a **Website theme & business summary** ahead of the exclusion results. It derives a topic summary from website title, description, and detected concept terms, and displays supporting excerpts. The same retrieved text is checked against all existing venue exclusions. This is explainable, rule-based inference, not generative AI; it does not understand visual-only advertising or guarantee approval. Replace the prior deployment with all files from this ZIP, including the updated Netlify Function (which returns websiteMeta).


## Artwork link handling
Artwork URL must serve an actual image (PNG/JPEG/WEBP/GIF/BMP), not a Dropbox/Drive preview, gallery page, or login screen. If a link is not an image, the app now shows a manual-review warning instead of failing the entire scan. Website analysis can still complete independently. You can upload an image file directly using Artwork upload.
