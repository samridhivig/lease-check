# LeaseCheck

Upload a Flemish rental contract (PDF) and get a breakdown of potential issues based on the Woninghuurdecreet 2019.

The tool extracts fields like deposit amount, notice periods, lease duration, and required clauses using regex pattern matching, then compares them against the legal thresholds. No LLM is used for analysis. There's also a translation feature for Dutch contracts that runs a small language model locally on the server.

Nothing is stored. Your PDF is processed in memory and discarded when the request finishes.

https://lease-check.vercel.app

## Running locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
