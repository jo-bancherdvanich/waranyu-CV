# Waranyu Bancherdvanich, data analyst portfolio

**Live site: [waranyu-cv.vercel.app](https://waranyu-cv.vercel.app)**

My portfolio and CV. Each project has a case study page, and most have a live demo you can try in the browser: embedded Power BI reports, an AI model's benchmark results, SQL queries that run on the real sample data, and a weather app.

## Projects

| Project | What it shows | Tools |
|---|---|---|
| [Australia's renewable transition](https://waranyu-cv.vercel.app/renewable.html) | Renewable share from 9% in 2005 to 35% in 2024, and an R forecast of 37.8% by 2030 against the 82% target | Power BI, DAX, R |
| [LocoLLM privacy-law adapter](https://waranyu-cv.vercel.app/locollm.html) | Client capstone: a small AI model trained on Australian privacy law and tested on a sealed 170-question benchmark | Python, LoRA |
| [FreshMart sales dashboard](https://waranyu-cv.vercel.app/freshmart.html) | A Kimball star schema over 17,697 transaction lines, after auditing five source tables | Power BI, Power Query, DAX |
| [Football club database](https://waranyu-cv.vercel.app/football-database.html) | 18 business rules turned into a normalised 16-table schema, with queries you can run | Oracle SQL, ERD |
| [WeatherWise](https://waranyu-cv.vercel.app/weatherwise.html) | A weather advisor that charts a 5-day forecast and answers plain-language questions | Python, Matplotlib |
| [IT infrastructure plan](https://waranyu-cv.vercel.app/infrastructure.html) | Linking a Perth head office to five remote centres, choosing Starlink on latency | Visio, Excel |
| [3D venue model](https://waranyu-cv.vercel.app/streaming-concept.html) | A Blender model of a sports venue showing 18 camera positions | Blender |

## How it is built

Plain HTML, CSS and JavaScript with no framework and no build step. Vercel deploys every push to `main`.

- `index.html` and one page per project
- `site.css` holds the colour and type tokens and the page layout; `components.css` styles the interactive demos
- `app.js` runs the theme switch and header; each demo has its own script
- `tools/check-design.mjs` checks every page for the site's design and content rules (`node tools/check-design.mjs`)
- `tools/cv-content.json` is the CV's single source; `node tools/cv-html.js` turns it into `tools/cv-source.html`, which is printed to `Waranyu-Bancherdvanich-CV.pdf`

To preview locally, serve the folder, for example with `npx http-server -p 5173`, and open http://localhost:5173.

## Contact

[Email](mailto:jojowaranyu.career@gmail.com) · [LinkedIn](https://www.linkedin.com/in/waranyu-ban/) · [GitHub](https://github.com/jo-bancherdvanich)
