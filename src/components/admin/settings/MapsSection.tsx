import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Map, Check, Save, Loader2 } from "lucide-react";

interface MapsSectionProps {
  googleMapsKey: string;
  setGoogleMapsKey: React.Dispatch<React.SetStateAction<string>>;
  handleSaveGoogleMaps: () => void;
  isSaving: boolean;
  isConfigured: boolean;
}

export function MapsSection({
  googleMapsKey,
  setGoogleMapsKey,
  handleSaveGoogleMaps,
  isSaving,
  isConfigured,
}: MapsSectionProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Map className="h-5 w-5" />
            Google Maps
            {isConfigured ? (
              <Badge className="bg-alert-resolved text-alert-resolved-foreground ml-2">
                <Check className="mr-1 h-3 w-3" />
                Configured
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-muted text-muted-foreground ml-2">
                Optional
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Optional: Enhanced map features for location tracking. Basic maps work without an API key.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Google Maps API Key</Label>
            <Input
              value={googleMapsKey}
              onChange={(e) => setGoogleMapsKey(e.target.value)}
              placeholder="AIza..."
            />
            <p className="text-xs text-muted-foreground">
              Get your key from the{" "}
              <a
                href="https://console.cloud.google.com/google/maps-apis"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Google Cloud Console
              </a>
            </p>
          </div>

          <Button onClick={handleSaveGoogleMaps} disabled={isSaving || !googleMapsKey.trim()}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Google Maps Key
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
