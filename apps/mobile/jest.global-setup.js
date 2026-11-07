// Pins the zone the whole suite runs in, whatever the machine's.
//
// Prayer times, the Hijri day and the moon's anchors are computed for a local day, and their
// tests state what they expect in one zone. Left to the machine's zone they pass in Stockholm
// and fail elsewhere: a CI runner, a laptop abroad.
//
// globalSetup runs in the parent process before Jest forks its workers, so every worker
// inherits the zone. Setting process.env.TZ inside a test file changes nothing: Jest gives each
// file its own copy of process.env. Stockholm, not UTC, on purpose: a test that only passes in
// UTC fails here.
module.exports = () => {
  process.env.TZ = 'Europe/Stockholm';
};
