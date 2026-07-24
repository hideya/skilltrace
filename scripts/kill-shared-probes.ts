import {
  sharedProbeWorkers,
  stopProcessTree,
} from './lib/skilltrace-process'

async function main() {
  let workers = sharedProbeWorkers()
  if (workers.length === 0) {
    console.log('No SkillTrace shared probe workers are running.')
    return
  }

  for (let worker of workers) {
    console.log(
      `Stopping SkillTrace shared probe ${worker.pid} for ${worker.server ?? 'an unknown server'}...`,
    )
    await stopProcessTree(worker.pid)
  }

  console.log(
    `Stopped ${workers.length} SkillTrace shared probe worker${workers.length === 1 ? '' : 's'}.`,
  )
}

await main()
