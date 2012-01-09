var pg = require("pg");

var self=this;

this.options = {
	connectionString:"",
	maximumNodesToExpand:3,
	cornerThreshold:2
};

this.doLookup = function(lat,lon, retFunc) {
	//sanitise input - could we do more than this?
	lat = parseFloat(lat);
	lon = parseFloat(lon);
	
	var client = new pg.Client(this.options.connectionString);
	var point = "Point({lon} {lat})".replace("{lon}",lon).replace("{lat}",lat);
		
	var initialStreet = null;
	var nodeResults = null;
	var finalNodes = [];
	
	var initialStreetQuery = function(ret) {
	
		// sort out the SQL query
		
		var queryText = "select l.*, w.nodes										\
			from osm_line l 														\
			join osm_ways w on l.osm_id = w.id										\
			where 																	\
			buffer(PointFromText($1, 4326), .001) && l.way							\
			and (l.railway is null and l.name is not null and l.name != '')			\
			and intersects(way														\
			  , buffer(PointFromText($1, 4326), .002)								\
			)																		\
			order by distance(way, PointFromText($1, 4326)) 						\
			limit 1																	\
			";
			
		
		var query = client.query(queryText,[point], function(err,data) {
			//console.log(data);
			initialStreet = data.rows[0];
			ret();
		});
		
	};
	
	var findAllNodes = function(ret) {
		
		// Manually adding the nodes array as I can't find out how to send an array as a parameter.
		// Ought to not be *too* bad since it's not user input.
		
		var queryText = "select n.id, x(n.geom) as lon, y(n.geom) as lat	\
			, distance_sphere(PointFromText($1, 4326), n.geom) as dist		\
			from nodes n													\
			where n.id in (" + initialStreet["nodes"].join(",") + ")												\
			order by distance(n.geom, PointFromText($1, 4326))				\
			limit $2";
			
		var query = client.query(queryText,[point,self.options.maximumNodesToExpand * 2], function(err,data) {
			nodeResults = data.rows;
			ret();
		});
	}
	
	var addWaysToNodes = function(ret) {
		//For each of nodes, pull out the ways that intersect that node
		var current = 0;
		
		for(var x=0;x<nodeResults.length;x++) {
			var queryText = "select l.name, l.osm_id		\
				from osm_line l 							\
				join way_nodes wn 							\
				on l.osm_id = wn.way_id						\
				where wn.node_id = $1						\
				and wn.way_id != $1							\
				and l.name is not null and l.name != ''";
			var f = function(row) {
				var query = client.query(queryText,[row["id"]], function(err,data) {
					row.all_ways = data.rows;
					row.ways = [];
					
					for(var y = 0;y<data.rows.length;y++){
						// Only use that way if it does not share the id or the normalized name of the original way
						if (data.rows[y]["id"] != initialStreet["osm_id"] && initialStreet["name"] != data.rows[y]["name"]) {
							row.ways.push(data.rows[y]);
						}
					}
					
					// Only keep this node if it has one or more valid ways intersecting the original way
					if (row.ways.length > 0) {
						finalNodes.push(row);
					}
					
					current++;
					if (current == nodeResults.length) {
						// All nodes are processed
						ret();
					}
				});
			}(nodeResults[x]);
		}
		
	}
	
	var finalReturn = {
		mainStreet:null,
		inBetween: []
	}
	
	var makeReturnFromRow = function(d) {
		return {
			name: d.ways[0]["name"],
			lat: d["lat"],
			lon: d["lon"]
		}
	}
	
	var calculateThresholds = function(ret) {
		finalReturn.mainStreet = {
			name: initialStreet["name"],
			//lat: initialStreet["lat"],
			//lon: initialStreet["lon"]
		}
		finalReturn.inBetween.push(makeReturnFromRow(finalNodes[0]));
		if (finalNodes[0].dist > self.options.cornerThreshold) {
			finalReturn.inBetween.push(makeReturnFromRow(finalNodes[1]));
		}
		
		retFunc(finalReturn);
	}

	client.connect();
	
	initialStreetQuery(
		function() {findAllNodes(
			function() {addWaysToNodes(calculateThresholds)}
		)})
	
};

