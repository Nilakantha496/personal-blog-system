@echo off
echo Setting up Virtual Environment...
python -m venv venv
call venv\Scripts\activate.bat

echo Installing dependencies...
pip install -r requirements.txt

echo Initializing database...
python -c "from app import app, db; app.app_context().push(); db.create_all()"

echo Setup complete! Run start.bat to run the server.
