const path = require("path");

module.exports = {
    mode: "production",
    entry: "./src/index.ts",
    devtool: "source-map",
    output: {
        filename: "shopchain.min.js",
        path: path.join(__dirname, "dist"),
        library: {
            type: "commonjs2",
        }
    },
    resolve: {
        extensions: [".ts"],
    },
    externals: {
        "web3-eth-contracts": {
            commonjs: "web3-eth-contracts",
            commonjs2: "web3-eth-contracts"
        },
        "web3-utils": {
            commonjs: "web3-utils",
            commonjs2: "web3-utils"
        }
    },
    module: {
        rules: [
            {
                test: /\.(json)$/,
                exclude: /node_modules/,
                use: ["json-loader"]
            },
            {
                test: /\.(ts)$/,
                exclude: /node_modules/,
                use: ["ts-loader"],
            },
        ],
    },
    plugins: [],
};
