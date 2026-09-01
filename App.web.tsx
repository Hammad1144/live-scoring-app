import React from 'react';
import { useWindowDimensions, View } from 'react-native';
import { ViewerMobileApp } from './src/web/ViewerMobileApp';
import { ViewerWebApp } from './src/web/ViewerWebApp';

function desktopZoomForWidth(width: number) {
  if (width >= 1440) return 1.18;
  if (width >= 1200) return 1.14;
  if (width >= 920) return 1.08;
  return 1;
}

export default function App() {
  const { width } = useWindowDimensions();

  if (width < 620) return <ViewerMobileApp />;

  const zoom = desktopZoomForWidth(width);
  if (zoom === 1) return <ViewerWebApp />;

  // Keep the desktop composition intact while scaling the complete viewer UI
  // to a more comfortable laptop/desktop reading size. The reciprocal width
  // prevents the zoomed surface from overflowing the browser viewport.
  const scaledStyle = {
    zoom,
    width: `${100 / zoom}%`,
    minHeight: `${100 / zoom}vh`,
  } as any;

  return (
    <View style={scaledStyle}>
      <ViewerWebApp />
    </View>
  );
}
