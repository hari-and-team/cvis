## Project-Local GCC

This directory is reserved for a compiler that is dedicated to `cvis`, instead of relying on the machine's default system GCC.

The preferred path is now the repo-local bootstrap command:

```bash
npm run setup:toolchain
```

That installs a pinned toolchain into `.cvis-toolchain/` and writes install metadata for the backend.

The backend looks for GCC in this order:

1. `CVIS_GCC_PATH`
2. `server/toolchain/bin/gcc(.exe)`
3. `.cvis-toolchain/bin/gcc(.exe)`
4. `tools/gcc/bin/gcc(.exe)`
5. system `gcc`

If you want to provide a manual override inside the repo instead of using the bootstrap flow, place the binary here:

```bash
server/toolchain/bin/gcc
```

On Windows, the same path can be:

```powershell
server/toolchain/bin/gcc.exe
```

You can also point the backend at any dedicated compiler path:

```bash
CVIS_GCC_PATH=/absolute/path/to/gcc npm run backend
```

This keeps the compiler choice scoped to this project instead of depending on the default GCC installed for the whole machine.
