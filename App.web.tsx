import React, { useEffect } from 'react';
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

  useEffect(() => {
    const globalAny = globalThis as any;
    const document = globalAny.document;
    if (!document) return;

    // Load Inter for the web/PWA only. It has strong legibility across body copy,
    // compact UI labels, bold headings, and italic text while keeping Android untouched.
    const fontLinkId = 'cricket-zone-web-font';
    if (!document.getElementById(fontLinkId)) {
      const preconnectGoogle = document.createElement('link');
      preconnectGoogle.rel = 'preconnect';
      preconnectGoogle.href = 'https://fonts.googleapis.com';
      document.head.appendChild(preconnectGoogle);

      const preconnectStatic = document.createElement('link');
      preconnectStatic.rel = 'preconnect';
      preconnectStatic.href = 'https://fonts.gstatic.com';
      preconnectStatic.crossOrigin = 'anonymous';
      document.head.appendChild(preconnectStatic);

      const fontLink = document.createElement('link');
      fontLink.id = fontLinkId;
      fontLink.rel = 'stylesheet';
      fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,500;1,600;1,700;1,800;1,900&display=swap';
      document.head.appendChild(fontLink);
    }

    // The app provides its own scroll containers. Hide browser-rendered scrollbar
    // chrome so scaling never produces a second/right-side rail while preserving
    // mouse-wheel, trackpad and touch scrolling. Apply a single web-only typography
    // stack to React Native Web output, inputs and buttons for consistent readability.
    const id = 'cricket-zone-web-reset';
    if (!document.getElementById(id)) {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = `
        html, body, #root {
          margin: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          background: #06150f;
          font-family: 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: optimizeLegibility;
        }

        #root, #root *, input, textarea, button, select {
          font-family: 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
        }

        strong, b { font-weight: 700; }
        em, i { font-style: italic; }

        * { scrollbar-width: none !important; -ms-overflow-style: none !important; }
        *::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
      `;
      document.head.appendChild(style);
    }
  }, []);

  if (width < 620) return <ViewerMobileApp />;

  const zoom = desktopZoomForWidth(width);
  if (zoom === 1) return <ViewerWebApp />;

  // Transform a reciprocal-size viewport instead of using CSS `zoom`.
  // The transformed surface fills the browser exactly, avoiding the narrow
  // blank strip and nested scrollbar introduced by layout-affecting zoom.
  const viewportStyle = {
    width: '100%',
    height: '100vh',
    overflow: 'hidden',
    backgroundColor: '#06150f',
  } as any;

  const scaledStyle = {
    width: `${100 / zoom}%`,
    height: `${100 / zoom}vh`,
    transform: [{ scale: zoom }],
    transformOrigin: 'top left',
  } as any;

  return (
    <View style={viewportStyle}>
      <View style={scaledStyle}>
        <ViewerWebApp />
      </View>
    </View>
  );
}
