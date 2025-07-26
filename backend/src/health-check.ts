import fetch from 'node-fetch';
import { config } from './config';

async function healthCheck() {
  try {
    const response = await fetch(`http://localhost:${config.port}/health`, {
      timeout: 3000,
    });
    
    if (response.ok) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (error) {
    process.exit(1);
  }
}

healthCheck();