 function Itinerary(){
    /* 
      An itinerary is a series of stops, with the following structure:
      wait_service_before --> departure_time --> drive_time --> wait_service_after --> arrival_time
    */

    // stops are destinations, first stop is initial pickup
    this.stops = [];
    // should probably eventually bet a set of feasible departure / arrival windows per stop
    // but keep it simple for now

    // departure_times[n] is the departure from stop n-1
    // by convention departure time 0 is blank (represents driver departing from previous ride / home base)
    this.departure_times = [];

    // arrival_times[n] is time of arrival at stop n
    // first arrival is driver getting to first pickup)
    this.arrival_times = [];

    // WSA[n] is the time spent from after the vehicle arrives 
    // until the departure of the vehicle towards stop[n]
    this.wait_service_times_before = [];

    // WSB[n] is the time spent from after the vehicle arrives at stop[n]
    // until the vehicle/driver is free to go
    this.wait_service_times_after = [];

    //drive_durations[n] is drive time from stop n-1 to stop n
    // first entry is 0 since it represents the driver going to the initial pickup
    this.drive_durations = [0];
    //drive_distances[n] is drive distance from stop n-1 to stop n
    // first entry is 0 since it represents the driver going to the initial pickup
    this.drive_distances = [0];
    this.directions = [];
    this.total_duration = -1;
    this.total_waitservice = -1;
    this.surplus_time = -1;
    this.bounds = [0,0];
    this.checkValid = function(){
        this.total_duration = 0;
        this.total_waitservice = 0;
        this.surplus_time = 0;
        if(this.stops.length > 1){
          let last_marker_time = -1;
          let duration_since_last_marker = 0;
          let last_marker_stop = -1;
          let last_marker_type = "";
          for(let stop = 0; stop < this.stops.length; stop++){
            let depart = this.departure_times[stop];
            let arrive = this.arrival_times[stop];
            // two constrained nodes are considered "adjacent" if there are only unconstrained nodes between them
            // all adjacently constrained nodes must be compatible factoring in drive times (& base wait & service)
            // any additional time beyond drive & specified wait & service is counted as extra wait & service
            // if all adjacent constrained nodes are compatible, this is sufficient for the entire ride to be valid
            duration_since_last_marker += this.wait_service_times_before[stop]*60000;
            this.total_duration += this.wait_service_times_before[stop]*60000;
            if(depart > -1){
              if(last_marker_time > -1){
                let surplus = depart - ( last_marker_time + duration_since_last_marker + this.wait_service_times_before[stop]);
                this.total_waitservice += this.wait_service_times_before[stop];
                if(surplus < 0) return false;
                this.surplus_time += surplus;
                this.total_duration += surplus;
              }else{
                //this is the first marker we've seen. Any duration before this can be used to calculate the theoretical beginning of the ride
                this.bounds[0] = depart - this.total_duration;
              }
              last_marker_time = depart;
              last_marker_type = "departure";
              last_marker_stop = stop;
              duration_since_last_marker = 0;
              
            }
            duration_since_last_marker += this.drive_durations[stop] * 1000;
            this.total_duration += this.drive_durations[stop]*1000;
            if(arrive > -1){
              if(last_marker_time > -1){
                let surplus = arrive - ( last_marker_time + duration_since_last_marker + this.wait_service_times_after[stop]);
                this.total_waitservice += this.wait_service_times_after[stop];
                if(surplus < 0) return false;
                this.surplus_time += surplus;
                this.total_duration += surplus;
              }else{
                //this is the first marker we've seen. Any duration before this can be used to calculate the theoretical beginning of the ride
                this.bounds[0] = arrive - this.total_duration;
              }
              last_marker_time = arrive;
              last_marker_type = "arrival";
              last_marker_stop = stop;
              duration_since_last_marker = 0;
            }
            duration_since_last_marker += this.wait_service_times_after[stop]*60000;
            this.total_duration += this.wait_service_times_after[stop]*60000;
          }  
        }
        if(this.bounds[0] > 0) this.bounds[1] = this.bounds[0] + this.total_duration;
        return true;
    }

    // departure & arrival times are expected to be epoc integer values
    this.addStop = function(destination, constraints={}){
      
      constraints.wait_service_before = ifudef(constraints.wait_service_before,constants.BASE_SERVICE_TIME);
      constraints.wait_service_after = ifudef(constraints.wait_service_after,constants.BASE_SERVICE_TIME);
      constraints.departure_time = ifudef(constraints.departure_time,-1);
      constraints.arrival_time = ifudef(constraints.arrival_time,-1);

      this.stops.push(destination);
      // when specifying an arrival_time for this next stop:
      // departure / arrival times must be compatible with rest of itinerary
      // if not, we should throw an error
      this.departure_times.push(constraints.departure_time);
      this.arrival_times.push(constraints.arrival_time);
      this.wait_service_times_before.push(constraints.wait_service_time_before);
      this.wait_service_times_after.push(constraints.wait_service_time_after);
      if(this.stops.length > 1){
        let directions = getDirections(this.stops[this.stops.length-2], this.stops[this.stops.length-1])
        this.directions.push(directions);
        let leg_duration = directions.routes[0].legs[0].duration.value;
        let leg_distance = directions.routes[0].legs[0].distance.value * 3.28084 / 5280;
        this.drive_durations.push(leg_duration);
        this.drive_distances.push(leg_distance);
      }
      return this.checkValid();
    }

    this.addConstraints = function(constraints=[]){
      for(let c in constraints){
        let constraint =constraints[c];
        if(constraint.stop && constraint.stop < this.stops.length){
          if(constraint.deparutre_time){
            this.departure_times[constraint.stop] = constraint.departure_time;
          }
          if(constraint.arrival_time){
            this.arrival_times[constraint.stop] = constraint.arrival_time;
          }
          if(constraint.wait_service_before){
            this.wait_service_times_before[constraint.stop] = constraint.wait_service_before;
          }
          if(constraint.wait_service_after){
            this.wait_service_times_after[constraint.stop] = constraint.wait_service_after;
          }
        }
      }
      return this.checkValid();
    }

    this.getRideDurationMin = function(){
      let valid = true;
      if(this.total_duration < 0){
        valid = this.checkValid();
      }
      if(valid){
        return this.total_duration;
      }else{
        throw new Error("Cannot request duration of ride as it is in an invalid state!");
      }
    }

    this.getTotalDistance = function(){
      let totalDistance = 0;
      if(this.checkValid()){
        for(let stop in this.stops){
          totalDistance+=this.drive_distances[stop];
        }
      }else{
        throw new Error("Cannot request ride distance as it is in an invalid state!");
      }
      return totalDistance;
    }

    this.stringify = function(){
      let data = {
          stops:this.stops,
          departure_times:this.departure_times,
          arrival_times:this.arrival_times,
          wait_service_times_before:this.wait_service_times_before,
          wait_service_times_after:this.wait_service_times_after,
          drive_durations:this.drive_durations,
          drive_distances:this.drive_distances,
          directions:this.directions,
          total_duration:this.total_duration,
          total_waitservice:this.total_waitservice,
          surplus_time:this.surplus_time,
          bounds:this.bounds
      }
	  var datastr = JSON.stringify(data);
	  console.log(datastr);
      return datastr;
    }
    this.parse = function(datastr){
      console.log("Parsing itinerary from string:");
	  console.log(datastr);
      let data = JSON.parse(datastr);
	  console.log("Parsed data.bounds:");
	  console.log(data.bounds);
      this.stops = data.stops;
      this.departure_times=data.departure_times,
      this.arrival_times=data.arrival_times,
      this.wait_service_times_before=data.wait_service_times_before,
      this.wait_service_times_after=data.wait_service_times_after = [];
      this.drive_durations=data.drive_durations,
      this.drive_distances=data.drive_distances,
      this.directions=data.directions,
      this.total_duration=data.total_duration,
      this.total_waitservice=data.total_waitservice,
      this.surplus_time=data.surplus_time,
      this.bounds=data.bounds
    }
    
  }

  function Ride(){
    
    this.id = -1;
    this.passenger = "";
    this.oneway = constants.ONE_WAY;
    this.wheelchair = constants.NO_WHEELCHAIR;
    this.itinerary = new Itinerary();
    this.stringify = function(){
      let data = {
        id:this.id,
        passenger:this.passenger,
        oneway:this.oneway,
        wheelchair:this.wheelchair,
        itinerary:this.itinerary.stringify()
      }
      return JSON.stringify(data);
    }
    this.parse = function(datastr){
      let data = JSON.parse(datastr);
      this.id = data.id;
      this.passenger = data.passenger;
      this.oneway = data.oneway;
      this.wheelchair = data.wheelchair;
      this.itinerary = new Itinerary();
      this.itinerary.parse(data.itinerary);
    }
  }
