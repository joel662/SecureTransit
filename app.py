import pandas as pd
import random
from datetime import datetime, timedelta

# Function to generate synthetic telematics data
def generate_telematics_data(num_records=5000):
    data = []
    current_speed = 0  # Start with an initial speed of 0
    current_time = datetime.now()  # Use the current time as the starting timestamp

    # Parameters
    k_base = 1.0  # Proportionality constant for pitch
    speed_limit = 60  # Speed cap in km/h

    for i in range(num_records):
        if i < 37:
            # Controlled phase: Only positive acceleration
            speed_change = random.uniform(0, 3)  # Speed always increases
            new_speed = min(speed_limit, current_speed + speed_change)  # Cap speed at 60 km/h
        else:
            # Normal phase: Speed can increase or decrease
            speed_change = random.uniform(-3, 3)
            new_speed = max(0, min(speed_limit, current_speed + speed_change))  # Clamp speed between 0 and 60

        # Calculate acceleration as the difference in speed
        acceleration = round((new_speed - current_speed), 2)

        # Update the current speed
        current_speed = round(new_speed, 2)

        # Adjust k with an error margin of ±5% to ±10%
        k = k_base * random.uniform(0.9, 1.1)

        # Gyroscope values
        if acceleration < 0:
            pitch = round(k * acceleration + random.uniform(-1, 1), 2)  # Negative pitch for negative acceleration
        else:
            pitch = round(k * acceleration + random.uniform(-1, 1), 2)  # Positive pitch for positive or zero acceleration

        # Clamp pitch to safe range
        pitch = max(-10, min(10, pitch))

        # Roll and Yaw within safe ranges
        roll = round(random.uniform(-10, 10) + random.uniform(-1, 1), 2)  # Add ±1 random variation
        yaw = round(random.uniform(-15, 15) + random.uniform(-1, 1), 2)  # Add ±1 random variation

        # Increment the timestamp by 1 second
        timestamp = current_time + timedelta(seconds=i)

        # Append the generated data to the list
        data.append({
            "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
            "speed_kmph": current_speed,
            "acceleration_mps2": acceleration,
            "gyroscope_pitch": pitch,
            "gyroscope_roll": roll,
            "gyroscope_yaw": yaw
        })

    # Convert to a Pandas DataFrame
    return pd.DataFrame(data)

# Generate synthetic data
num_records = 5000  # Number of records to generate
telematics_data = generate_telematics_data(num_records)

# Display a sample of the DataFrame
print(telematics_data.head())

# Save the data to a CSV file
telematics_data.to_csv("synthetic_telematics_data.csv", index=False)
print(f"Synthetic telematics data saved to 'synthetic_telematics_data.csv' ({num_records} rows).")
