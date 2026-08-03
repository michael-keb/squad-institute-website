# Squad Institute — go-to-market site

**Positioning:** A **marketplace of startups for work experience** — not a course, not fake placement. Claim a seat → Sprint → pack you can open. Optional longer Venture after you show up.

**Voice:** Seductive but honest — wanted / chosen / claim the seat. Proof you can open, reply within five business days. No equity or job guarantees in the hero.

## Pages (ship these)

| Page | File | Job |
|---|---|---|
| Home | `index.html` | Desire + marketplace board |
| Active squads | `active-squads.html` | Full crew + open seats |
| How it works | `how-it-works.html` | See → want → sit → ship |
| Builders | `builders.html` | Proof arcs (illustrative) |
| Career coaching | `career-coaching.html` | Between-jobs door (ST1/ST2) |
| Apply | `apply.html` | Claim a seat · or `?path=coaching` |
| FAQ | `faq.html` | Unblock money / visa / trust |
| Contact | `contact.html` | Direct channel |
| Privacy | `privacy.html` | Legal |

Internal / not primary GTM: `candidate-explainer.html`, `brain-map-audit/`.

## Preview locally

```bash
cd website
npx --yes serve .
```

Open `http://localhost:3000` (or the port `serve` prints).

## Launch checklist

- [ ] Host `website/` on your domain (Render static — see root `render.yaml`)
- [ ] Deploy **squad-institute-api** on Render and set **`SENDGRID_API_KEY`** (see [`../website-api/README.md`](../website-api/README.md))
- [ ] SendGrid: verify domain or single sender for `contact@thesquadinstitute.com`
- [ ] DNS: website CNAME + keep Mailgun MX for inbound mail
- [ ] Test `/apply.html` and `/contact.html` submit on production
- [ ] Keep **illustrative** labels until live repos / real people are linked
- [ ] Honour **5 business day** apply reply SLA — this is the trust product
- [ ] Confirm `contact@thesquadinstitute.com` inbox receives SendGrid notifications
- [ ] Optional: replace Dicebear avatars with real opt-in photos

## Design system

Canonical brand lives in [`../design-system/`](../design-system/) — tokens, base components, brandmark, README. The app already loads it; migrate marketing pages off inline `:root` onto `base.css` when you touch a page.

- Ink `#16151C` · Bone `#F3F2EC` · Teal `#1F6F5B` · Lime `#C6F24E` · Coral `#E85D4C`
- Fonts: Space Grotesk · Hanken Grotesk · JetBrains Mono
- Primary CTA: **Claim a seat**

Product / signup: [`../squad-app/`](../squad-app/) → http://localhost:8094/signup  
Operating model: [`../Operating model/`](../Operating%20model/)  
Brain map: [`../archive/prototype/graduate_brain_dependency_map.mermaid`](../archive/prototype/graduate_brain_dependency_map.mermaid)
