import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Button, Alert } from 'react-native';
import MapView, { Polyline, Marker } from 'react-native-maps';
import { Picker } from '@react-native-picker/picker';
import { getDistance } from 'geolib';
interface Coordinate {
  latitude: number;
  longitude: number;
}

interface Route {
  routeId: string;
  coordinates: Coordinate[];
}

interface TelematicsDataPoint {
  timestamp: string;
  speed_kmph: string;
  acceleration_mps2: string;
  gyroscope_pitch: string;
  gyroscope_roll: string;
  gyroscope_yaw: string;
}

const App: React.FC = () => {
  const [routeData, setRouteData] = useState<Route[]>([]); // Routes fetched from API
  const [busRoutes, setBusRoutes] = useState<Route[]>([]); // Displayed routes
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null); // Selected route
  const [simulationIndex, setSimulationIndex] = useState<number | null>(null); // Index for simulation
  const mapRef = useRef<MapView>(null);
  

  // Include your CSV data as a string
  const csvData = `
timestamp,speed_kmph,acceleration_mps2,gyroscope_pitch,gyroscope_roll,gyroscope_yaw
2024-11-16 22:29:50,0.16,0.16,-0.35,6.93,-6.96
2024-11-16 22:29:51,0.45,0.29,0.3,8.61,-10.86
2024-11-16 22:29:52,2.92,2.47,2.44,7.44,3.32
2024-11-16 22:29:53,4.03,1.11,2.02,0.14,-2.17
2024-11-16 22:29:54,6.89,2.86,2.79,4.22,2.84
2024-11-16 22:29:55,8.35,1.46,0.64,-0.63,-13.17
2024-11-16 22:29:56,8.76,0.41,-0.55,2.42,-1.59
2024-11-16 22:29:57,10.15,1.39,0.82,8.76,6.46
2024-11-16 22:29:58,10.89,0.74,-0.05,-5.61,-6.98
2024-11-16 22:29:59,12.49,1.6,1.17,-10.2,-7.0
2024-11-16 22:30:00,12.89,0.4,0.16,8.67,-9.08
2024-11-16 22:30:01,15.5,2.61,2.64,1.73,-9.16
2024-11-16 22:30:02,16.39,0.89,0.73,4.25,-11.84
2024-11-16 22:30:03,17.45,1.06,1.54,5.12,-4.54
2024-11-16 22:30:04,20.13,2.68,2.27,-6.06,-4.02
2024-11-16 22:30:05,21.95,1.82,1.3,2.51,-12.61
2024-11-16 22:30:06,22.94,0.99,1.68,-4.87,9.55
`;

  // Function to parse the CSV data
  const parseCSV = (str: string): TelematicsDataPoint[] => {
    const lines = str.trim().split('\n');
    const result: TelematicsDataPoint[] = [];
    const headers = lines[0].split(',');

    for (let i = 1; i < lines.length; i++) {
      const obj: any = {};
      const currentline = lines[i].split(',');

      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = currentline[j];
      }

      result.push(obj);
    }

    return result;
  };

  // Parse the CSV data
  const telematicsData = parseCSV(csvData);

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
          prevIndex >= telematicsData.length - 1
        ) {
          clearInterval(interval);
          setSimulationIndex(null); // Stop simulation
          Alert.alert('Simulation Complete', 'Route simulation finished.');
          return null;
        }

        // Get the current data point
        const dataPoint = telematicsData[prevIndex];

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

  // Render the routes on the map
  const renderBusRoutes = () => {
    if (!busRoutes || busRoutes.length === 0) return null;

    return busRoutes.map((route, index) => (
      <Polyline
        key={`${route.routeId}-${index}`}
        coordinates={route.coordinates}
        strokeColor="#0000FF"
        strokeWidth={3}
      />
    ));
  };

  // Render the simulation marker
  const renderSimulationMarker = () => {
    if (simulationIndex === null || busRoutes.length === 0) return null;

    const route = busRoutes[0]; // Assume the first route in busRoutes is the selected one
    const currentCoordinate = route.coordinates[simulationIndex];

    return (
      <Marker
        coordinate={currentCoordinate}
        title="Simulated Position"
        description={`Point ${simulationIndex + 1} of ${route.coordinates.length}`}
      />
    );
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
        {renderBusRoutes()}
        {renderSimulationMarker()}
      </MapView>

      <Picker
        selectedValue={selectedRoute}
        onValueChange={(value) => {
          handleRouteSelection(value);
        }}
        style={styles.picker}
      >
        <Picker.Item label="Select a route" value={null} />
        {routeData.map((route) => (
          <Picker.Item key={route.routeId} label={`Route ${route.routeId}`} value={route.routeId} />
        ))}
      </Picker>

      <Button
        title="Start Simulation"
        onPress={startSimulation}
        disabled={!selectedRoute}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  picker: { height: 50, backgroundColor: '#ffffff', marginTop: 10 },
});

export default App;
