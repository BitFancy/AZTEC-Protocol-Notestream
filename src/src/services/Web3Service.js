import Web3 from 'web3';

class Web3Service {
    constructor() {
        this.web3 = null;
        this.contracts = {};
        this.abis = {};
        this.account = null;
    }

    async init({
        providerUrl = 'http://localhost:8545',
        provider = window.web3.currentProvider,
        account,
    } = {}) {
        await window.web3.currentProvider.enable();

        if (!this.web3) {
            this.web3 = new Web3(window.web3.currentProvider);
        }

        if (account) {
            this.account = account;
        } else {
            const [address] = await this.web3.eth.getAccounts();
            if (address) {
                this.account = {
                    address,
                };
            }
        }
    }

    registerContract(
        config,
        {
            contractName = '',
            contractAddress = '',
        } = {},
    ) {
        if (!this.web3) return;

        const name = contractName || config.contractName;

        if (!config.abi) {
            console.log(`Contract object "${name}" doesn't have an abi.`);
            return;
        }

        const lastNetworkId = Object.keys(config.networks).pop();
        const network = config.networks[lastNetworkId];
        const address = contractAddress
          || (network && network.address);
        if (!address) {
            console.log(`Contract object "${name}" doesn't have an address. Please set an address first.`);
        }

        this.abis[name] = config.abi;
        this.contracts[name] = new this.web3.eth.Contract(
            config.abi,
            address,
        );
    }

    registerInterface(
        config,
        {
            name = '',
        } = {},
    ) {
        if (!this.web3) return;

        const interfaceName = name || config.contractName;
        this.abis[interfaceName] = config.abi;
    }

    hasContract(contractName) {
        return !!this.contracts[contractName];
    }

    contract(contractName) {
        if (!this.hasContract(contractName)) {
            console.log(`Contract object "${contractName}" hasn't been initiated.`);
        }
        this.contracts[contractName].address = this.contracts[contractName]._address;

        return this.contracts[contractName];
    }

    deployed(contractName, contractAddress = '') {
        let contract;
        if (!contractAddress) {
            contract = this.contracts[contractName];
        } else if (this.abis[contractName]) {
            contract = new this.web3.eth.Contract(
                this.abis[contractName],
                contractAddress,
            );
        }
        if (!contract) {
            console.log(`'${contractName}' is not registered as a contract.`);
        }
        return contract;
    }

    async sendAsync(args) {
        return new Promise((resolve, reject) => {
            this.web3.givenProvider.sendAsync(args, (err, result) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(result);
            });
        });
    }

    async deploy(config, constructorArguments = []) {
        const contractObj = new this.web3.eth.Contract(config.abi);
        const { bytecode } = config;
        const { address } = this.account;
        contractObj.options.data = bytecode;
        const deployOptions = {
            data: bytecode,
            arguments: constructorArguments,
        };
        const gas = await contractObj.deploy(deployOptions).estimateGas();

        return new Promise((resolve, reject) => {
            contractObj
                .deploy(deployOptions)
                .send({
                    from: address,
                    gas: gas * 3,
                })
                .once('transactionHash', (receipt) => {
                    console.log(receipt);
                    const interval = setInterval(() => {
                        console.log('in interval');
                        this.web3.eth.getTransactionReceipt(receipt, (error, transactionReceipt) => {
                            console.log('data', transactionReceipt);
                            if (transactionReceipt) {
                                clearInterval(interval);
                                resolve(transactionReceipt);
                            } else if (error) {
                                console.log('error', error);
                                clearInterval(interval);
                                reject(new Error(error));
                            }
                        });
                    }, 1000);
                // if (!receipt) {
                //     reject();
                // } else {
                //     resolve(receipt);
                // }
                });
        });
    }

    triggerMethod = async (type, method, ...args) => {
        const { address } = this.account;
        const methodSetting = (args.length
            && typeof args[args.length - 1] === 'object'
            && !Array.isArray(args[args.length - 1])
            && args[args.length - 1])
            || null;
        const methodArgs = methodSetting
            ? args.slice(0, args.length - 1)
            : args;

        if (type === 'call') {
            return method(...methodArgs).call({
                from: address,
                gas: 6500000,
                ...methodSetting,
            });
        }

        return new Promise(async (resolve, reject) => {
            const methodCall = method(...methodArgs)[type]({
                from: address,
                ...methodSetting,
                gas: 6500000,
            });

            methodCall.once('transactionHash', (receipt) => {
                console.log(receipt);
                const interval = setInterval(() => {
                    console.log('in interval');
                    this.web3.eth.getTransactionReceipt(receipt, (error, transactionReceipt) => {
                        console.log('data', transactionReceipt);
                        if (transactionReceipt) {
                            clearInterval(interval);
                            resolve(transactionReceipt);
                        } else if (error) {
                            console.log('error', error);
                            clearInterval(interval);
                            reject(new Error(error));
                        }
                    });
                }, 1000);
                // if (!receipt) {
                //     reject();
                // } else {
                //     resolve(receipt);
                // }
            });
        });
    };

    useContract(contractName, contractAddress = null) {
        return {
            method: (methodName) => {
                const contract = this.deployed(contractName, contractAddress);
                if (!contract) {
                    throw new Error(`Cannot call method '${methodName}' of undefined.`);
                }

                const method = contract.methods[methodName];
                if (!method) {
                    throw new Error(`Method '${methodName}' is not defined in contract '${contractName}'.`);
                }

                return {
                    call: async (...args) => this.triggerMethod('call', method, ...args),
                    send: async (...args) => this.triggerMethod('send', method, ...args),
                };
            },
            events: (eventName) => {
                const contract = this.deployed(contractName, contractAddress);
                if (!contract) {
                    throw new Error(`Cannot call waitForEvent('${eventName}') of undefined.`);
                }
                return {
                    where: (options = {}) => contract.getPastEvents(eventName, {
                        filter: options,
                    }),
                    all: () => contract.getPastEvents('allEvents', {
                        fromBlock: 0,
                    }),
                };
            },
            at: (address) => {
                if (!address) {
                    throw new Error(`'address' cannot be empty in useContract(${contractName}).at(address)`);
                }
                if (!this.abis[contractName]) {
                    console.log(`'${contractName}' is not registered as an interface.`);
                }
                return this.useContract(contractName, address);
            },
        };
    }
}

export default new Web3Service();
