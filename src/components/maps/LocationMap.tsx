import { useState } from "react";
import { MapPin, Navigation, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface LocationMapProps {
  lat: number;
  lng: number;
  address?: string;
  showDirections?: boolean;
  height?: string;
  className?: string;
}

export function LocationMap({ 
  lat, 
  lng, 
  address, 
  showDirections = true,
  height = "300px",
  className = ""
}: LocationMapProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Google Maps directions URL
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  // Open in Google Maps
  const openInMaps = () => {
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, "_blank");
  };

  // Open directions
  const openDirections = () => {
    window.open(directionsUrl, "_blank");
  };

  return (
    <Card className={className}>
      <CardContent className="p-0 overflow-hidden rounded-lg">
        {/* Map Display */}
        <div className="relative" style={{ height }}>
          {isLoading && (
            <div className="absolute inset-0 z-10">
              <Skeleton className="w-full h-full" />
            </div>
          )}
          
          {/* Use iframe for Google Maps embed */}
          <iframe
            src={`https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`}
            width="100%"
            height="100%"
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setError("Map failed to load");
            }}
          />

          {/* Fallback if iframe fails */}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              <div className="text-center space-y-2">
                <MapPin className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">
                  {lat.toFixed(6)}, {lng.toFixed(6)}
                </p>
                <Button variant="outline" size="sm" onClick={openInMaps}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open in Google Maps
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Address and Actions */}
        <div className="p-3 bg-background border-t space-y-2">
          {address && (
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <p className="text-sm">{address}</p>
            </div>
          )}
          
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Lat: {lat.toFixed(6)}</span>
            <span>•</span>
            <span>Lng: {lng.toFixed(6)}</span>
          </div>

          {showDirections && (
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" className="flex-1" onClick={openInMaps}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Map
              </Button>
              <Button variant="default" size="sm" className="flex-1" onClick={openDirections}>
                <Navigation className="h-4 w-4 mr-2" />
                Directions
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Reverse geocoding utility
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    // Use OpenStreetMap Nominatim for reverse geocoding (free, no API key)
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      {
        headers: {
          "Accept-Language": "es,en",
          "User-Agent": "ICE-Alarm-App"
        }
      }
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    return data.display_name || null;
  } catch (error) {
    console.error("Reverse geocoding error:", error);
    return null;
  }
}

// Location history component
interface LocationHistoryProps {
  locations: Array<{
    lat: number;
    lng: number;
    timestamp: string;
    address?: string;
  }>;
  height?: string;
}

export function LocationHistory({ locations, height = "400px" }: LocationHistoryProps) {
  if (locations.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No location history available</p>
        </CardContent>
      </Card>
    );
  }

  // Show most recent location on map, list all
  const latestLocation = locations[0];

  return (
    <div className="space-y-4">
      <LocationMap
        lat={latestLocation.lat}
        lng={latestLocation.lng}
        address={latestLocation.address}
        height={height}
      />

      {locations.length > 1 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Location History</h4>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {locations.map((loc, index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-sm"
              >
                <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate">
                  {loc.address || `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`}
                </span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(loc.timestamp).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
