import React from 'react';
import { useWindowDimensions } from 'react-native';
import { ViewerMobileApp } from './src/web/ViewerMobileApp';
import { ViewerWebApp } from './src/web/ViewerWebApp';

export default function App() {
  const { width } = useWindowDimensions();
  return width < 620 ? <ViewerMobileApp /> : <ViewerWebApp />;
}
