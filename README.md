<p align="center">
  <img src="docs/images/selenis-logo.png" width="100" alt="SELENIS logo: a crescent Moon with an orbital path">
</p>

<h1 align="center"><a href="https://selenis-timorex.netlify.app/">Visit SELENIS</a></h1>

<p align="center"><a href="https://selenis-timorex.netlify.app/">https://selenis-timorex.netlify.app/</a></p>

<p align="center">
  <em>Where eternal light meets perpetual shadow.</em><br>
  Explore terrain, sunlight, and the line of sight to Earth at the lunar south pole.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/NASA-Space%20Apps-343940?style=flat-square" alt="NASA Space Apps Challenge">
  <img src="https://img.shields.io/badge/React-18-343940?style=flat-square" alt="React 18">
  <img src="https://img.shields.io/badge/3D-Three.js%20%2B%20R3F-343940?style=flat-square" alt="Three.js and React Three Fiber">
  <img src="https://img.shields.io/badge/Data-JPL%20Horizons%20%2B%20LOLA-343940?style=flat-square" alt="JPL Horizons and LOLA data">
</p>

<p align="center">
  <a href="#why-the-lunar-south-pole">Why the south pole?</a> &nbsp;&middot;&nbsp;
  <a href="#explore-selenis">Features</a> &nbsp;&middot;&nbsp;
  <a href="#run-locally">Get started</a> &nbsp;&middot;&nbsp;
  <a href="#data-and-references">Data and references</a>
</p>

<p align="center">
  <img src="docs/images/landing-page.jpeg" width="880" alt="SELENIS landing page with a Moon model and a Launch 3D Navigator button">
</p>

<p align="center">
  <strong>Understand the terrain. Compare locations. Explore the Moon.</strong><br>
  <sub>A 3D lunar navigation demo for the NASA Space Apps Challenge.</sub>
</p>

---

## Why the lunar south pole?

Near the Moon's south pole, the Sun moves low along the horizon. Ridges and crater rims can block sunlight, while other areas receive light for longer periods. Terrain can also obstruct a location's view of Earth.

These conditions make the choice of a landing site an intriguing problem to explore. **SELENIS** helps visualize the relationship between topography, illumination, and the geometric line of sight to Earth in a browser-based 3D application.

## Explore SELENIS

<p align="center">
  <img src="docs/images/navigator.png" width="880" alt="SELENIS navigator showing 3D lunar terrain, the Sun and Earth, a site summary, and time controls">
</p>

- **Explore terrain in 3D.** Visit the Connecting Ridge, Shackleton Rim, and de Gerlache Rim regions.
- **Compare locations.** Select or place sites to view summaries of sunlight, Earth visibility, and slope.
- **See the horizon.** Examine the directions of the Sun and Earth and the horizon profile from a selected site.
- **Change the time.** Use the date and simulation controls to explore changes in celestial positions.
- **Choose your experience.** Planner mode presents technical details; Explorer mode offers a more concise view.

> **About the results:** SELENIS is a hackathon demo and has not been validated for real mission planning or landing safety assessments. Horizon calculations are limited to the available DEM coverage; a geometric line of sight to Earth does not guarantee communication quality, and sunlight exposure does not guarantee power generation.

## How is the data used?

SELENIS combines ephemerides from **NASA JPL Horizons** with lunar topography data from **LOLA/LROC**. A Python pipeline processes the data into JSON and textures included in the repository. The React application displays them as terrain, metrics, and visualizations in the browser.

Times are displayed in **UTC**. The included Site01 ephemeris spans November 14 through December 13, 2026, at hourly intervals. Dates outside that range use an approximate projection in the application, not new Horizons results; its accuracy has not been validated for mission decisions. WebGL shadows are visualizations and do not replace horizon analysis based on terrain data.

---

## Run locally

To try the website locally, install [Git](https://git-scm.com/) and **Node.js 24.19.0** with npm, and use a browser that supports WebGL 2. Running the frontend does not require Docker, an API key, or an `.env` file.

```bash
git clone https://github.com/kelekers/selenis.git
cd selenis
npm ci
npm run dev
```

Open the **Local** address printed in the terminal, usually `http://127.0.0.1:5173/`, then select **Launch 3D Navigator**. If that port is already in use, Vite will display a different address. Press `Ctrl+C` to stop the server.

In PowerShell, if `npm.ps1` is blocked, use `npm.cmd ci` and `npm.cmd run dev`. The included curated data is sufficient to try the application; you do not need to rerun the pipeline or download NASA data.

## For developers

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server. |
| `npm test` | Run the JavaScript tests. |
| `npm run lint` | Check frontend code with ESLint. |
| `npm run data:check` | Check the manifest and public asset integrity. |
| `npm run build` | Build the production files in `dist/`. |
| `npm run preview` | Serve the built application locally. |
| `npm run verify` | Run lint, tests, data validation, and the build. |

To work with the pipeline, install [uv](https://docs.astral.sh/uv/getting-started/installation/) and use Python 3.13 as specified in `.python-version`:

```bash
uv sync --locked
uv run --locked python -m unittest discover -s data-pipeline -p "test_*.py"
uv run --locked python data-pipeline/build_site_telemetry.py --help
```

Regenerating data requires the appropriate inputs and can overwrite public assets. Check the sources, parameters, and output paths first. See the [data contract](docs/data-contract.md) and [technical references](docs/REFERENCES.md) for details.

**Check status:** at the last verification, the JavaScript tests and build passed, but `npm run verify` did not pass because of existing lint errors. `npm run data:check` also reported that `textures/site01_heightmap2.webp` was not registered. Rerun the checks before drawing conclusions about the latest version.

## Frequently asked questions

**Do I need Docker or a NASA data download to get started?**

No. To run the frontend, install the Node.js dependencies and run `npm run dev`. The curated data used by the demo is included in the repository.

**Why is the 3D view not appearing?**

Check that WebGL 2 and hardware acceleration are available in your browser. The application provides a fallback view when WebGL 2 is unavailable.

**Does a line of sight to Earth guarantee communication?**

No. The displayed line of sight is a geometric assessment, not a complete calculation of radio-link quality or availability.

**What if installation or data loading fails?**

Make sure your Node.js version matches `.nvmrc`, run commands from the repository root, and check terminal messages or the browser's Network tab. For checksum issues, use LF line endings and follow the [data contract](docs/data-contract.md).

## Data and references

- [NASA JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) — Sun and Earth ephemerides.
- [LROC QuickMap](https://quickmap.lroc.asu.edu/) and [NASA Moon Trek](https://trek.nasa.gov/moon/) — lunar imagery and topography references.
- [Canadian Space Agency: Moon Exploration](https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/) — lunar exploration reference.
- [Technical references and model credits](docs/REFERENCES.md).

Each dataset and model is subject to its source's terms of use. A license for the project code has not yet been specified.
