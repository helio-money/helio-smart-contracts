require("dotenv").config();
require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-waffle");
require('@nomiclabs/hardhat-truffle5');
require('@nomiclabs/hardhat-web3');
require("hardhat-gas-reporter");
require('hardhat-contract-sizer');
require("solidity-coverage");
require('hardhat-spdx-license-identifier');
require('hardhat-abi-exporter');
require('hardhat-storage-layout');
require('@openzeppelin/hardhat-upgrades');
const fs = require("fs");

module.exports = {
    solidity: {
        compilers: [
            {
                version: '0.8.10',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 100
                    }
                }
            },
        ]
    },

    networks: {
        // hardhat: {
        //     // allowUnlimitedContractSize: true,
        //     forking: {
        //         url: `https://speedy-nodes-nyc.moralis.io/${process.env.MORALIS_PROJECT_ID}/bsc/testnet`,
        //         accounts: [`0x${process.env.DEPLOYER_PRIVATE_KEY}`],
        //         // blockNumber: 19441731
        //     }
        // },
        bsc: {
            url: `https://speedy-nodes-nyc.moralis.io/${process.env.MORALIS_PROJECT_ID}/bsc/mainnet`,
            chainId: 56,
            accounts: [`0x${process.env.DEPLOYER_PRIVATE_KEY}`]
        },

        bsc_testnet: {
            url: `https://speedy-nodes-nyc.moralis.io/${process.env.MORALIS_PROJECT_ID}/bsc/testnet`,
            chainId: 97,
            accounts: [`0x${process.env.DEPLOYER_PRIVATE_KEY}`]
        },
    },

    etherscan: {
        apiKey: {
            bsc: process.env.BSC_API_KEY,
            bscTestnet: process.env.BSC_API_KEY
        }
    },

    mocha: {
        grep: '^(?!.*; using Ganache).*'
    },

    contractSizer: {
        alphaSort: true,
        runOnCompile: true,
        disambiguatePaths: false,
    },

    gasReporter: {
        enabled: process.env.REPORT_GAS ? true : false,
        currency: 'USD',
    },
};


function getSortedFiles(dependenciesGraph) {
    const tsort = require("tsort")
    const graph = tsort()

    const filesMap = {}
    const resolvedFiles = dependenciesGraph.getResolvedFiles()
    resolvedFiles.forEach((f) => (filesMap[f.sourceName] = f))

    for (const [from, deps] of dependenciesGraph.entries()) {
        for (const to of deps) {
            graph.add(to.sourceName, from.sourceName)
        }
    }

    const topologicalSortedNames = graph.sort()

    // If an entry has no dependency it won't be included in the graph, so we
    // add them and then dedup the array
    const withEntries = topologicalSortedNames.concat(resolvedFiles.map((f) => f.sourceName))

    const sortedNames = [...new Set(withEntries)]
    return sortedNames.map((n) => filesMap[n])
}

function getFileWithoutImports(resolvedFile) {
    const IMPORT_SOLIDITY_REGEX = /^\s*import(\s+)[\s\S]*?;\s*$/gm

    return resolvedFile.content.rawContent.replace(IMPORT_SOLIDITY_REGEX, "").trim()
}

subtask("flat:get-flattened-sources", "Returns all contracts and their dependencies flattened")
    .addOptionalParam("files", undefined, undefined, types.any)
    .addOptionalParam("output", undefined, undefined, types.string)
    .setAction(async ({files, output}, {run}) => {
        const dependencyGraph = await run("flat:get-dependency-graph", {files})
        console.log(dependencyGraph)

        let flattened = ""

        if (dependencyGraph.getResolvedFiles().length === 0) {
            return flattened
        }

        const sortedFiles = getSortedFiles(dependencyGraph)

        let isFirst = true
        for (const file of sortedFiles) {
            if (!isFirst) {
                flattened += "\n"
            }
            flattened += `// File ${file.getVersionedName()}\n`
            flattened += `${getFileWithoutImports(file)}\n`

            isFirst = false
        }

        // Remove every line started with "// SPDX-License-Identifier:"
        flattened = flattened.replace(/SPDX-License-Identifier:/gm, "License-Identifier:")

        flattened = `// SPDX-License-Identifier: MIXED\n\n${flattened}`

        // Remove every line started with "pragma experimental ABIEncoderV2;" except the first one
        flattened = flattened.replace(/pragma experimental ABIEncoderV2;\n/gm, ((i) => (m) => (!i++ ? m : ""))(0))
        // Remove every line started with "pragma abicoder v2;" except the first one
        flattened = flattened.replace(/pragma abicoder v2;\n/gm, ((i) => (m) => (!i++ ? m : ""))(0))
        // Remove every line started with "pragma solidity ****" except the first one
        flattened = flattened.replace(/pragma solidity .*$\n/gm, ((i) => (m) => (!i++ ? m : ""))(0))


        flattened = flattened.trim()
        if (output) {
            console.log("Writing to", output)
            fs.writeFileSync(output, flattened)
            return ""
        }
        return flattened
    })

subtask("flat:get-dependency-graph")
    .addOptionalParam("files", undefined, undefined, types.any)
    .setAction(async ({files}, {run}) => {
        const sourcePaths = files === undefined ? await run("compile:solidity:get-source-paths") : files.map((f) => fs.realpathSync(f))

        const sourceNames = await run("compile:solidity:get-source-names", {
            sourcePaths,
        })

        const dependencyGraph = await run("compile:solidity:get-dependency-graph", {sourceNames})

        return dependencyGraph
    })

task("flat", "Flattens and prints contracts and their dependencies")
    .addOptionalVariadicPositionalParam("files", "The files to flatten", undefined, types.inputFile)
    .addOptionalParam("output", "Specify the output file", undefined, types.string)
    .setAction(async ({files, output}, {run}) => {
        console.log(
            await run("flat:get-flattened-sources", {
                files,
                output,
            })
        )
    })
