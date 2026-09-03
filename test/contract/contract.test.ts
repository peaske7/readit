import { bunAdapter, goAdapter, workerAdapter } from "./adapters";
import { runContractSuite } from "./contract";

for (const adapter of [bunAdapter(), goAdapter(), workerAdapter()]) {
  runContractSuite(adapter);
}
