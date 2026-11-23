"""Offline regression checks; no GRIB downloads or GDAL import required."""
import copy
import json
from pathlib import Path
from unittest import TestCase

from archive_rules import merge_runs, validate_temperatures


class ArchiveRulesTests(TestCase):
    def setUp(self):
        self.archive=json.loads((Path(__file__).resolve().parents[1]/"runs.json").read_text())

    def test_same_cycle_is_idempotent_and_changed_cycle_needs_explicit_flag(self):
        incoming=copy.deepcopy(self.archive)
        incoming["runs"]=incoming["runs"][-1:]
        self.assertEqual(merge_runs(self.archive,incoming),self.archive["runs"])
        day=next(iter(incoming["runs"][0]["days"]))
        incoming["runs"][0]["days"][day][0][0]+=1
        with self.assertRaisesRegex(ValueError,"replace-existing"):
            merge_runs(self.archive,incoming)
        changed=merge_runs(self.archive,incoming,True)
        self.assertNotEqual(changed[-1],self.archive["runs"][-1])

    def test_method_changes_are_not_silently_merged(self):
        for key,value in [("units","°C·day"),("model","Another model"),("components",["cdd","hdd"]),("weight","Gas demand")]:
            incoming={**self.archive,key:value}
            with self.assertRaisesRegex(ValueError,"different method"):
                merge_runs(self.archive,incoming)

    def test_cache_temperature_rules_match_fresh_sample_rules(self):
        self.assertEqual(validate_temperatures([-100.,0.,150.],3),[-100.,0.,150.])
        class ColumnArray(list):
            shape = (1, 1)
        with self.assertRaisesRegex(ValueError,"temperatures"):
            validate_temperatures(ColumnArray([1.]),1)
        for values in ([float("nan")],[151.],[-101.],[[1.,2.]],[]):
            with self.assertRaisesRegex(ValueError,"temperatures"):
                validate_temperatures(values,1)
