from odoo import api, models


class Cadastro(models.Model):
    _name = "legacy.cadastro"

    @api.multi
    def name_get(self):
        return [(r.id, r.name) for r in self]
