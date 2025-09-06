# MongoDB Sync Tool Pro

A modern desktop app built with CustomTkinter to manage and synchronize MongoDB databases. It includes browsing/CRUD, index management, saved queries, online/offline sync, analytics dashboard with automatic chart recommendations, performance monitor, and bilingual in‑app guide (VN/EN).

## Features

- Management
  - Browse databases/collections and view documents
  - Create/Drop collections
  - Create/Edit/Delete documents (JSON editor)
  - Simple and Advanced (JSON) filtering, pagination, sort, projection
  - Index management: list/create/drop
  - Saved queries and connection profiles
- Sync
  - Online sync between two MongoDB instances (data + indexes)
  - Offline sync: export to ZIP and import from ZIP
- Analytics (Upgraded)
  - Visualization dashboard with database/collection dropdowns
  - Chart types: Auto, Collection Overview, Field Distribution, Time Series, Query Performance
  - Auto mode analyzes sample data to recommend a chart (time series / categorical bar / numeric histogram)
  - Theme-aware charts (Dark/Light)
- Performance
  - Simulated CPU/Memory trends and database activity placeholders
- Guide & Contact
  - Bilingual in-app guide (Tiếng Việt & English)
  - Contact information for support

## Requirements

- Python 3.10+
- A running MongoDB instance (local/remote)
- Python packages (see `requirements.txt`)
- For Sync features (online/offline), install MongoDB CLI tools and add them to PATH:
  - `mongodump`, `mongorestore`, `mongoexport`, `mongoimport`

## Installation

1) Clone or download this repository.

2) Install dependencies:

```bash
pip install -r requirements.txt
```

3) (Optional) Verify MongoDB CLI tools are available:

```bash
mongodump --version
mongorestore --version
mongoimport --version
mongoexport --version
```

## Run (from source)

```bash
python app.py
```

- On first run, you can switch theme from the top-right theme selector.
- Connect to your MongoDB using a URI (e.g., `mongodb://localhost:27017`).
- If the URI requires auth, enable "URI has password" and provide `authSource` (e.g., `admin`).

## Using the App

- Management tab
  - Enter a MongoDB URI and click "Connect"
  - Expand a database to see collections
  - Use Simple filter (Field + Value) or Advanced filter (JSON)
  - Edit a document by double-clicking it; create or delete with the action buttons
  - Manage indexes in the right side panel

- Sync tab
  - Online: set Source and Destination URIs + DB names, then Start Sync
  - Offline: Export to ZIP from a source DB, or Import a ZIP into a destination DB
  - Use the Tools check to verify Mongo CLI tools are available

- Analytics tab (Upgraded)
  - Database and Collection dropdowns at the top of the tab
  - Chart Type menu includes Auto, Collection Overview, Field Distribution, Time Series, Query Performance
  - Auto mode samples documents and auto-picks a suitable chart:
    - Datetime field → time series chart
    - Categorical string (low cardinality) → bar chart
    - Numeric field → histogram
    - Fallback → field distribution dashboard
  - Press "Refresh" to reload DB/collection lists and redraw chart

- Performance tab
  - Simulated CPU/Memory metrics and placeholders for DB metrics

- Guide & Contact tabs
  - Read the bilingual guide
  - Use contact information for support

## Packaging (Optional)

This repository includes a `build/` and `dist/` folder from previous packaging. To run the latest code, prefer running `python app.py` during development.
If you want to rebuild an executable, you can use PyInstaller (example command):

```bash
pyinstaller --noconfirm --onefile --windowed --icon images.ico MongoSyncTool.spec
```

Adjust for your environment as needed.

## Troubleshooting

- Analytics shows nothing even after connecting
  - Ensure you are running the updated source (`python app.py`), not an old EXE
  - In Analytics, select a Database and a Collection, then choose a Chart Type (try Auto)
  - Click "Refresh" in the Analytics header
  - Check `logs/app.log` for error messages

- Cannot connect to MongoDB
  - Verify URI, network, credentials, and `authSource`

- Sync errors
  - Ensure MongoDB CLI tools are installed and on PATH (`mongodump`, `mongorestore`, `mongoexport`, `mongoimport`)
  - Check permissions and disk space
  - See `logs/app.log` for details

## Project Structure

```
├─ app.py                  # Main application (UI, tabs, logic)
├─ data_visualization.py   # VisualizationManager & DataVisualizer (matplotlib + seaborn)
├─ advanced_export.py      # Advanced export utilities
├─ query_builder.py        # Query builder helpers
├─ requirements.txt        # Python dependencies
├─ logs/                   # Application logs
├─ dist/                   # Built executables (if any)
├─ build/                  # Build artifacts (if any)
```

## Screenshots

Add your own screenshots here for reference, e.g.:
- Management tab
- Sync tab
- Analytics tab (Auto chart)

## License

© 2025. All rights reserved by the project authors. See in-app Contact tab for support information.

## Credits

- CustomTkinter, Tkinter
- PyMongo
- Matplotlib, Seaborn, Pandas, NumPy
- MongoDB CLI tools (mongodump/mongorestore/mongoexport/mongoimport)
