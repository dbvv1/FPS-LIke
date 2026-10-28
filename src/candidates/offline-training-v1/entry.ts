import './ui/style.css';
import { validateOfflineTrainingOptions } from '../../candidate-route.js';
validateOfflineTrainingOptions(location.search);
await import('./client.js');
