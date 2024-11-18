import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Button, Alert, Platform } from 'react-native';
import MapView, { Polyline, Marker } from 'react-native-maps';
import { Picker } from '@react-native-picker/picker';
import { csvData } from '../../synthetic_telematics_data'; // Import the raw CSV data or JSON
import haversine from 'haversine-distance';

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
    const obj: { [key: string]: string } = {};
    const currentline = lines[i].split(',');

    for (let j = 0; j < headers.length; j++) {
      obj[headers[j].trim()] = currentline[j].trim();
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
  const [simulationData, setSimulationData] = useState<any[]>([]); // Telematics data for simulation
  const [markerPosition, setMarkerPosition] = useState<Coordinate | null>(null); // Position of the simulated vehicle
  const mapRef = useRef<MapView>(null);
  const simulationTimerRef = useRef<NodeJS.Timeout | null>(null);

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

    // Clean up the timer when the component unmounts
    return () => {
      if (simulationTimerRef.current) {
        clearTimeout(simulationTimerRef.current);
      }
    };
  }, []);

  // Handle route selection from the Picker
  const handleRouteSelection = (routeId: string | null) => {
    if (!routeId) return;

    // Clear existing simulation
    setMarkerPosition(null);
    if (simulationTimerRef.current) {
      clearTimeout(simulationTimerRef.current);
      simulationTimerRef.current = null;
    }

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

  // Function to calculate distances between coordinates
  const calculateRouteDistances = (coordinates: Coordinate[]) => {
    const distances = [];
    let totalDistance = 0;

    for (let i = 0; i < coordinates.length - 1; i++) {
      const start = coordinates[i];
      const end = coordinates[i + 1];

      const distance = haversine(start, end);
      distances.push(distance);
      totalDistance += distance;
    }

    return { distances, totalDistance };
  };

  // Function to get position along the route based on distance traveled
  const getPositionAlongRoute = (
    coordinates: Coordinate[],
    distances: number[],
    distanceTraveled: number
  ): Coordinate => {
    let accumulatedDistance = 0;

    for (let i = 0; i < distances.length; i++) {
      const segmentDistance = distances[i];
      if (accumulatedDistance + segmentDistance >= distanceTraveled) {
        const ratio = (distanceTraveled - accumulatedDistance) / segmentDistance;
        const start = coordinates[i];
        const end = coordinates[i + 1];

        const latitude = start.latitude + (end.latitude - start.latitude) * ratio;
        const longitude = start.longitude + (end.longitude - start.longitude) * ratio;

        return { latitude, longitude };
      }
      accumulatedDistance += segmentDistance;
    }

    // If distanceTraveled exceeds the route length, return the last coordinate
    return coordinates[coordinates.length - 1];
  };

  // Start the simulation
  const startSimulation = () => {
    if (!selectedRoute) return;

    // Clear existing timer if any
    if (simulationTimerRef.current) {
      clearTimeout(simulationTimerRef.current);
      simulationTimerRef.current = null;
    }

    // Get the selected route
    const selected = routeData.find((route) => route.routeId === selectedRoute);
    if (!selected) {
      Alert.alert('Error', 'Selected route data not found.');
      return;
    }

    // Calculate route distances
    const { distances, totalDistance } = calculateRouteDistances(selected.coordinates);

    // Ensure there is simulation data
    if (parsedTelematicsData.length === 0) {
      Alert.alert('Error', 'No simulation data available.');
      return;
    }

    // Sort the data by timestamp
    const simulationData = [...parsedTelematicsData];
    simulationData.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    setSimulationData(simulationData);

    // Start the simulation
    simulateStep(0, simulationData, selected.coordinates, distances);
  };

  // Recursive function to simulate vehicle movement
  const simulateStep = (
    index: number,
    data: any[],
    coordinates: Coordinate[],
    distances: number[]
  ) => {
    if (index >= data.length - 1) {
      // Simulation complete
      setMarkerPosition(null);
      if (simulationTimerRef.current) {
        clearTimeout(simulationTimerRef.current);
        simulationTimerRef.current = null;
      }
      return;
    }

    // Calculate the time difference to the next data point in milliseconds
    const currentTimestamp = new Date(data[index].timestamp).getTime();
    const nextTimestamp = new Date(data[index + 1].timestamp).getTime();
    let delay = nextTimestamp - currentTimestamp;

    if (delay < 0) delay = 0; // Ensure non-negative delay

    // Calculate distance traveled during this time interval
    const speed = parseFloat(data[index].speed_kmph); // Speed in km/h
    const timeDiffHours = delay / (1000 * 3600); // Time difference in hours
    const distanceTraveled = speed * timeDiffHours * 1000; // Convert km to meters

    // Accumulate total distance traveled
    const previousDistance = data[index].cumulativeDistance || 0;
    const cumulativeDistance = previousDistance + distanceTraveled;

    // Update the cumulative distance in the data array
    data[index + 1].cumulativeDistance = cumulativeDistance;

    // Get position along the route
    const position = getPositionAlongRoute(coordinates, distances, cumulativeDistance);

    // Update the marker position
    setMarkerPosition(position);

    // --- Add the event detection logic here ---

    // Parse the telematics data to ensure they are numbers
    const acceleration_mps2 = parseFloat(data[index].acceleration_mps2);
    const gyroscope_yaw = parseFloat(data[index].gyroscope_yaw);
    const gyroscope_roll = parseFloat(data[index].gyroscope_roll);

    // Check for harsh acceleration or braking
    if (acceleration_mps2 > 1.25) {
      console.log('Harsh Acceleration detected at timestamp:', data[index].timestamp);
    } else if (acceleration_mps2 < -1.25) {
      console.log('Harsh Braking detected at timestamp:', data[index].timestamp);
    }

    // Check for aggressive driving based on gyroscope yaw
    if (gyroscope_yaw > 15 || gyroscope_yaw < -15) {
      console.log('Aggressive Driving detected at timestamp:', data[index].timestamp);
    }

    // Check for harsh cornering based on gyroscope roll
    if (gyroscope_roll > 10 || gyroscope_roll < -10) {
      console.log('Harsh Cornering detected at timestamp:', data[index].timestamp);
    }

    // ------------------------------------------

    // Schedule the next step
    simulationTimerRef.current = setTimeout(() => {
      simulateStep(index + 1, data, coordinates, distances);
    }, delay);
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
            strokeColor="#FF00FF"
            strokeWidth={3}
          />
        ))}
        {markerPosition && (
          <Marker coordinate={markerPosition} title="Simulated Position" />
        )}
      </MapView>
      <View style={styles.rowContainer}>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={selectedRoute}
            onValueChange={(value) => handleRouteSelection(value)}
            style={styles.picker}
            itemStyle={styles.pickerItem}
          >
            <Picker.Item label="Select a route" value={null} />
            {routeData.map((route) => (
              <Picker.Item
                key={route.routeId}
                label={`Route ${route.routeId}`}
                value={route.routeId}
              />
            ))}
          </Picker>
        </View>
        <View style={styles.buttonContainer}>
          <Button
            title="Start Simulation"
            onPress={startSimulation}
            disabled={!selectedRoute}
          />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 2,
  },
  map: {
    flex: 1,
  },
  rowContainer: {
    flexDirection: 'row', // Arrange items in a row
    alignItems: 'center', // Center vertically
    justifyContent: 'space-between', // Space between picker and button
    paddingHorizontal: 10, // Add padding to the sides
    marginBottom: 20,
  },
  
  pickerContainer: {
    flex: 1, // Take up remaining space
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CCCCCC',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Platform.OS === 'ios' ? -250 : 0
  },
  picker: {
    width: '100%',
    height: 50,
    color: '#000',
  },
  pickerItem: {
    color: '#000',
    textAlign: 'center',
    marginTop: -80
  },
  buttonContainer: {
    marginLeft: 10, // Add spacing between picker and button
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Platform.OS === 'ios' ? -250 : 0
  },
});


export default App;
