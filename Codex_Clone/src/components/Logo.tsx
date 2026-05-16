import React from 'react';


export const Logo: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <img
    src="src/assets/ForgeCode.jpeg"
    alt="ForgeCode Logo"
    style={{ width: size, height: size, borderRadius: '4px', objectFit: 'cover' }}
  />
);
