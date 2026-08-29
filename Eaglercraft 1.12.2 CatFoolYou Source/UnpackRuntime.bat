@echo off
rd /s /q runtime
mkdir runtime
copy /Y ./build/distributions/EaglerGradle-1.0.0.zip ./runtime
cd runtime
tar -xf EaglerGradle-1.0.0.zip
cd ..
