import { Client } from "ssh2";
import { readFileSync } from "node:fs";
import { config } from "dotenv";

config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const PROXY = {
  host: process.env.PROXY_HOST,
  user: process.env.PROXY_USER,
};

const REMOTE = {
  host: process.env.REMOTE_HOST,
  user: process.env.REMOTE_USER,
};

const runSNMP = (command) => {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn
      .on("ready", () => {
        let output = "";
        conn.exec(command, (err, stream) => {
          if (err) reject(err);
          stream
            .on("data", (data) => (output += data))
            .on("close", () => {
              resolve(output);
              conn.end();
            })
            .stderr.on("data", (data) => reject(data));
        });
      })
      .connect({
        host: PROXY.host,
        port: 22,
        username: PROXY.user,
        privateKey: readFileSync(PRIVATE_KEY),
      });
  });
};

const snmp = async (ip, community) => {
  const ifOids = {
    ifIndex: "INTEGER: ",
    ifName: "STRING: ",
    ifDescr: "STRING: ",
    ifAlias: "STRING: ",
    ifHighSpee: "Gauge32: ",
    ifOperstatus: "INTEGER: ",
    ifAdminStatus: "INTEGER: ",
  };
  const sysOids = {sysname: "", syslocation: ""};

  let command = `ssh ${REMOTE.user}@${REMOTE.host}`;
  command = `${command} /usr/sfw/bin/snmpwalk -v 2c -c ${community} ${ip}`;

  await Promise.all(
    Object.keys(ifOids).map(async (oid) => {
      return await runSNMP(`${command} ${oid}`)
        .then((res) => {
          const arr = res
            .split("\n")
            .map((item) => item.split(ifOids[oid])[1])
            .filter((item) => item !== undefined);
          ifOids[oid] = arr;
        })
        .catch((err) => console.error(err));
    }),
    Object.keys(sysOids).map(async (oid) => {
      return await runSNMP(`${command} ${oid}`)
        .then((res) => {
          const arr = res
            .split("\n")
            .map((item) => item.split("STRING: ")[1])
            .filter((item) => item !== undefined);
          sysOids[oid] = arr[0];
        })
        .catch((err) => console.error(err));
    })
  );

  return {sysOids, ifOids}
};

const main = async () => {
  const result = await snmp("192.168.1.1", "public");
  console.log(result);
};

main()
