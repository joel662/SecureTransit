import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Button, Alert } from 'react-native';
import MapView, { Polyline, Marker } from 'react-native-maps';
import { Picker } from '@react-native-picker/picker';
import { csvData } from '../../synthetic_telematics_data'; // Import the raw CSV data or JSON

// Function to parse the CSV data
const parseCSV = (str: string): any[] => {
  if (!str) {
    console.error('CSV data is invalid. Ensure it is a non-empty string.');
    return [];
  }

  const lines = str.trim().split('\n');
  const result: any[] = [];
  const headers = lines[0].split(',');

  for (let i = 1; i < lines.length; i++) {
    const obj: { [key: string]: string } = {}; // Index signature allows dynamic keys
    const currentline = lines[i].split(',');

    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = currentline[j];
    }

    result.push(obj);
  }

  return result;
};


// Determine the format of csvData and parse if necessary
const parsedTelematicsData = Array.isArray(csvData) ? csvData : parseCSV(csvData);

// Interface definitions for TypeScript users (optional, for clarity)
interface Coordinate {
  latitude: number;
  longitude: number;
}

interface Route {
  routeId: string;
  coordinates: Coordinate[];
}

const App: React.FC = () => {
  const [routeData, setRouteData] = useState<Route[]>([]); // Routes fetched from API
  const [busRoutes, setBusRoutes] = useState<Route[]>([]); // Displayed routes
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null); // Selected route
  const [simulationIndex, setSimulationIndex] = useState<number | null>(null); // Index for simulation
  const mapRef = useRef<MapView>(null);

  // Fetch route data from API
  const fetchRouteData = async () => {
    try {
      const response = await fetch(
        'https://services3.arcgis.com/rl7ACuZkiFsmDA2g/arcgis/rest/services/Transit_Stops_and_Routes/FeatureServer/1/query?outFields=*&where=1%3D1&f=geojson'
      );
      const data = await response.json();

      const validRoutes: Route[] = data.features
        .filter(
          (feature: any) =>
            feature.geometry &&
            feature.geometry.coordinates &&
            Array.isArray(feature.geometry.coordinates) &&
            feature.geometry.coordinates.length > 0
        )
        .map((feature: any) => {
          const validCoordinates: Coordinate[] = feature.geometry.coordinates
            .filter(
              (coord: any) =>
                Array.isArray(coord) &&
                coord.length >= 2 &&
                typeof coord[0] === 'number' &&
                typeof coord[1] === 'number'
            )
            .map((coord: any) => ({
              latitude: Number(coord[1]),
              longitude: Number(coord[0]),
            }));

          return {
            routeId: feature.properties.route_id,
            coordinates: validCoordinates,
          };
        })
        .filter((route: Route) => route.coordinates.length > 0);

      setRouteData(validRoutes);
      setBusRoutes(validRoutes); // Initially display all routes
    } catch (error) {
      console.error('Error fetching route data:', error);
      Alert.alert('Error', 'Failed to fetch route data. Please try again later.');
    }
  };

  useEffect(() => {
    fetchRouteData(); // Fetch route data on mount
  }, []);

  // Handle route selection from the Picker
  const handleRouteSelection = (routeId: string | null) => {
    if (!routeId) return;

    const selected = routeData.find((route) => route.routeId === routeId);
    if (selected) {
      setSelectedRoute(routeId);
      setBusRoutes([selected]); // Display only the selected route

      // Adjust the map to fit the selected route's coordinates
      if (mapRef.current) {
        mapRef.current.fitToCoordinates(selected.coordinates, {
          edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
          animated: true,
        });
      }
    }
  };

  // Start simulation along the selected route
  const startSimulation = () => {
    if (!selectedRoute) {
      Alert.alert('Error', 'Please select a route to simulate.');
      return;
    }

    const route = busRoutes[0]; // Assume busRoutes contains the selected route
    if (!route || route.coordinates.length === 0) {
      Alert.alert('Error', 'Invalid route for simulation.');
      return;
    }

    setSimulationIndex(0); // Start simulation at the first coordinate

    const interval = setInterval(() => {
      setSimulationIndex((prevIndex) => {
        if (
          prevIndex === null ||
          prevIndex >= route.coordinates.length - 1 ||
          prevIndex >= parsedTelematicsData.length - 1
        ) {
          clearInterval(interval);
          setSimulationIndex(null); // Stop simulation
          Alert.alert('Simulation Complete', 'Route simulation finished.');
          return null;
        }

        // Get the current data point
        const dataPoint = parsedTelematicsData[prevIndex];

        // Perform checks
        if (dataPoint) {
          const acceleration = parseFloat(dataPoint.acceleration_mps2);
          const gyroscope_roll = parseFloat(dataPoint.gyroscope_roll);
          const gyroscope_yaw = parseFloat(dataPoint.gyroscope_yaw);

          if (acceleration > 1.5) {
            console.log('Harsh acceleration');
          }
          if (acceleration < -1.5) {
            console.log('Harsh braking');
          }
          if (gyroscope_roll > 10 || gyroscope_roll < -10) {
            console.log('Harsh cornering');
          }
          if (gyroscope_yaw > 15 || gyroscope_yaw < -15) {
            console.log('Aggressive cornering');
          }
        }

        return prevIndex + 1; // Move to the next coordinate
      });
    }, 1000); // Move every 1 second
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: 43.7315,
          longitude: -79.7624,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
      >
        {busRoutes.map((route, index) => (
          <Polyline
            key={`${route.routeId}-${index}`}
            coordinates={route.coordinates}
            strokeColor="#0000FF"
            strokeWidth={3}
          />
        ))}
        {simulationIndex !== null && busRoutes.length > 0 && (
          <Marker
            coordinate={busRoutes[0].coordinates[simulationIndex]}
            title="Simulated Position"
          />
        )}
      </MapView>
      <Picker
        selectedValue={selectedRoute}
        onValueChange={(value) => handleRouteSelection(value)}
        style={styles.picker}
      >
        <Picker.Item label="Select a route" value={null} />
        {routeData.map((route) => (
          <Picker.Item key={route.routeId} label={`Route ${route.routeId}`} value={route.routeId} />
        ))}
      </Picker>
      <Button title="Start Simulation" onPress={startSimulation} disabled={!selectedRoute} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  picker: { height: 50, backgroundColor: '#ffffff', marginTop: 10 },
});

export default App;
