---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, artifacts, posters, or applications (examples include websites, landing pages, dashboards, React components, HTML/CSS layouts, or when styling/beautifying any web UI). Generates creative, polished code and UI design that avoids generic AI aesthetics.
license: Complete terms in LICENSE.txt
---

This skill guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

Approach this as the design lead at a small studio known for giving every client a visual identity that could not be mistaken for anyone else's. This client has already rejected proposals that felt templated, and is paying for a distinctive point of view: make deliberate, opinionated choices about palette, typography, and layout that are specific to this brief, and take one real aesthetic risk you can justify.

The user provides frontend requirements: a component, page, application, or interface to build. They may include context about the purpose, audience, or technical constraints.

## Ground it in the Subject

If the brief does not pin down what the product or subject is, pin it yourself before designing: name one concrete subject, its audience, and the page's single job, and state your choice. If there's any information in your memory about the human's preferences, context about what they're building, or designs you've made before – use that as a hint. The subject's own world — its materials, instruments, artifacts, and vernacular — is where distinctive choices come from. Build with the brief's real content and subject matter throughout.

## Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. There are so many flavors to choose from. Use these for inspiration but design one that is true to the aesthetic direction.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work — the key is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

## Process: Brainstorm → Plan → Critique → Build → Critique Again

Work in two passes. First, brainstorm a short design plan based on the brief:

- **Color**: Describe the palette as 4–6 named hex values.
- **Type**: The typefaces for 2+ roles — a characterful display face used with restraint, a complementary body face, and a utility face for captions or data if needed.
- **Layout**: A layout concept using one-sentence prose descriptions and ASCII wireframes to ideate and compare.
- **Signature**: The single unique element this page will be remembered by — something that embodies the brief in an appropriate way.

Then review that plan against the brief before building: if any part reads like the generic default you would produce for any similar page, revise it, say what you changed and why. Only after confirming the relative uniqueness of your design plan should you start writing code, following the revised plan exactly and deriving every color and type decision from it.

Try to do most of this planning and iteration in your thinking, and only show ideas to the user when you have higher confidence it'll delight them.

## Frontend Aesthetics Guidelines

Focus on:
- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial, Inter, Roboto, and Space Grotesk; opt instead for distinctive choices that elevate the aesthetics. Pair a characterful display face with a refined body font. Set a clear type scale with intentional weights, widths, and spacing — make the type treatment itself a memorable part of the design.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes. Describe the full palette as 4–6 named hex values before coding.
- **Motion**: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise. However, sometimes less is more — extra animation contributes to the feeling that the design is AI-generated.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Add contextual effects and textures that match the overall aesthetic. Apply creative forms like gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, and grain overlays.
- **Structure is Information**: Structural devices — numbering, eyebrows, dividers, labels — should encode something true about the content, not merely decorate it. Question choices like numbered markers (01 / 02 / 03): only use them if the content actually is a sequence where order carries information the reader needs.

NEVER use generic AI-generated aesthetics like overused font families (Inter, Roboto, Arial, Space Grotesk, system fonts), clichéd color schemes (particularly purple gradients on white backgrounds), predictable layouts and component patterns, and cookie-cutter design that lacks context-specific character.

For calibration — AI-generated design currently clusters around three looks to avoid:
1. Warm cream background (~#F4F1EA) with high-contrast serif display and terracotta accent
2. Near-black background with a single bright acid-green or vermilion accent
3. Broadsheet-style layout with hairline rules, zero border-radius, and dense newspaper-like columns

All three are legitimate for some briefs, but they are defaults rather than choices. Where the brief pins down a visual direction, follow it exactly. Where it leaves an axis free, don't spend that freedom on one of these defaults.

Interpret creatively and make unexpected choices that feel genuinely designed for the context. No design should be the same. Vary between light and dark themes, different fonts, different aesthetics. NEVER converge on common choices across generations.

**IMPORTANT**: Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details. Elegance comes from executing the chosen vision well.

## Restraint and Self-Critique

Spend your boldness in one place. Let the signature element be the one memorable thing, keep everything around it quiet and disciplined, and cut any decoration that does not serve the brief. Not taking a risk can be a risk itself.

Build to a quality floor without announcing it: responsive down to mobile, visible keyboard focus, reduced motion respected.

Critique your own work as you build, taking screenshots if your environment supports it — a picture is worth 1000 tokens. Consider Chanel's advice: before leaving the house, take a look in the mirror and remove one accessory.

Be careful of structuring CSS selector specificities — it's easy to generate CSS classes that cancel each other out (especially with a type-based selector like `.section` and an element-based selector like `.cta`). This happens often with paddings/margins between sections.

## Writing in Design

Words appear in a design for one reason: to make it easier to understand, and therefore easier to use. They are design material, not decoration. Bring the same intentionality to copy that you would bring to spacing and color.

- Write from the end user's side of the screen. Name things by what people control and recognize, never by how the system is built.
- Use active voice as default. A control should say exactly what happens when it's used: "Save changes," not "Submit."
- Keep action names consistent through the whole flow: the button that says "Publish" produces a toast that says "Published."
- Treat failure and emptiness as moments for direction, not mood. Explain what went wrong and how to fix it. Errors don't apologize and are never vague.
- Keep the register conversational: plain verbs, sentence case, no filler, tone matched to the brand and audience.

## Hero and Above-the-Fold

The hero is a thesis. Open with the most characteristic thing in the subject's world, in whatever form makes sense: a headline, an image, an animation, a live demo, an interactive moment. A big number with a small label, supporting stats, and a gradient accent is the template answer — only use it if that's truly the best option for the specific brief.

Remember: Claude is capable of extraordinary creative work. Don't hold back — show what can truly be created when thinking outside the box and committing fully to a distinctive vision.
