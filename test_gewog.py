
import geopandas as gpd
from shapely.geometry import Point

# Load ALL Bhutan gewog polygons, not just the 17 selected ones
gewogs = gpd.read_file("GMC_Gewogs.geojson")

print("CRS:", gewogs.crs)
print("Total gewogs:", len(gewogs))

# Example GPS coordinates: replace with your actual sighting
latitude = 26.732833
longitude = 89.829747

# GPS coordinates are longitude, latitude when creating a Point
point = gpd.GeoSeries(
    [Point(longitude, latitude)],
    crs="EPSG:4326"
).to_crs(gewogs.crs).iloc[0]

# Find the gewog containing the sighting
matches = gewogs[gewogs.geometry.covers(point)]

if matches.empty:
    print("No gewog contains this point.")
else:
    for _, gewog in matches.iterrows():
        print("\nSighting gewog:", gewog["name_eng"])
        print("Gewog code:", gewog["gewog_code"])

        # Find neighbouring gewogs sharing a boundary
        neighbours = gewogs[
            gewogs.geometry.touches(gewog.geometry)
        ]

        print("Neighbouring gewogs:")
        for _, neighbour in neighbours.iterrows():
            print(
                "-", neighbour["name_eng"],
                "| Code:", neighbour["gewog_code"]
            )
